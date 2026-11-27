import { useCallback } from 'react';
import {
  UndoRedoHistory,
  iterateSerializedCsvChunks,
  serializeCsv,
  serializeJsonl,
  serializeLog,
  type FileSystemAdapter,
  type ParsedCsvData,
  type UndoApplyTarget,
} from '@metatext-editor/core';
import type { EditorHostMode } from '../../SettingsAboutDialogs';
import type { NewFileFormat } from '../../newFileTemplates';
import type { MetaSaveOptions } from './useDocumentLoader';

export interface UseFileSaveAndUndoParams {
  adapter: FileSystemAdapter;
  hostMode: EditorHostMode;
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  autoWidths: number[];
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  scheduleMetaSave: (nextText: string, options?: MetaSaveOptions) => void;
  fileName: string;
  isReadOnly: boolean;
  dirtyCsv: boolean;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  rowsRef: React.MutableRefObject<string[][]>;
  metaTextRef: React.MutableRefObject<string | null>;
  historyRef: React.MutableRefObject<UndoRedoHistory>;
  onNewFile?: (format?: NewFileFormat) => void;
  onSaveAs?: (bytes: Uint8Array, metaText: string) => Promise<boolean | void> | boolean | void;
  onSaveAsStream?: (
    chunks: Iterable<Uint8Array>,
    metaText: string,
  ) => Promise<boolean | void> | boolean | void;
  onCloseFile?: () => void;
  onDocumentEdit?: (label: string) => void;
  onAfterSaveSnapshot?: (dataBytes: Uint8Array | undefined, message?: string) => void;
  maxSnapshotDataBytes?: number;
  skipSnapshotBytesCapture?: boolean;
}

export function useFileSaveAndUndo({
  adapter,
  hostMode,
  csvData,
  setCsvData,
  autoWidths,
  setAutoWidths,
  scheduleMetaSave,
  fileName,
  isReadOnly,
  dirtyCsv,
  setDirtyCsv,
  setDataVersion,
  setStatusMsg,
  rowsRef,
  metaTextRef,
  historyRef,
  onNewFile,
  onSaveAs,
  onSaveAsStream,
  onCloseFile,
  onDocumentEdit,
  onAfterSaveSnapshot,
  maxSnapshotDataBytes,
  skipSnapshotBytesCapture,
}: UseFileSaveAndUndoParams) {
  const serializeCurrentCsv = useCallback((): Uint8Array | null => {
    if (!csvData) return null;
    if (csvData.format === 'jsonl' && csvData.jsonlOptions) {
      return serializeJsonl(csvData.columnKeys, rowsRef.current, csvData.jsonlOptions);
    }
    if ((csvData.format === 'log' || csvData.format === 'text') && csvData.logOptions) {
      return serializeLog(csvData.columnKeys, rowsRef.current, csvData.logOptions);
    }
    return serializeCsv(csvData.headers, rowsRef.current, csvData.dialect);
  }, [csvData, rowsRef]);

  const handleSaveCsv = useCallback(async () => {
    if (!csvData) return;
    try {
      // Metadata-only save: when raw text/data has no unsaved edits, flush .metatext.jsonc
      // and record a snapshot WITHOUT rewriting the source file so its mtime stays unchanged.
      if (!dirtyCsv) {
        if (metaTextRef.current !== null) {
          await adapter.saveMeta(metaTextRef.current);
        }
        setStatusMsg(`Saved metadata (${fileName})`);
        onAfterSaveSnapshot?.(undefined, `Saved metadata (${fileName})`);
        return;
      }
      if (isReadOnly) {
        setStatusMsg('Read-Only mode — unlock to save changes');
        return;
      }
      const isCsvOrTsv = !csvData.format || csvData.format === 'csv' || csvData.format === 'tsv';
      let savedBytesForSnapshot: Uint8Array | undefined;
      if (isCsvOrTsv && adapter.saveCsvStream) {
        const chunkRows = 20_000;
        const totalRows = rowsRef.current.length;
        const showProgress = totalRows >= 50_000;
        if (showProgress) {
          setStatusMsg(`Saving ${fileName} (0%)...`);
        }
        const snapshotChunks: Uint8Array[] = [];
        let snapshotByteTotal = 0;
        const capBytes = maxSnapshotDataBytes ?? 20 * 1024 * 1024;
        let captureExceeded = Boolean(skipSnapshotBytesCapture) || capBytes === 0;
        const chunkGen = iterateSerializedCsvChunks(
          csvData.headers,
          rowsRef.current,
          csvData.dialect,
          chunkRows,
        );
        const trackedChunks = (function* () {
          let processedRows = 0;
          for (const chunk of chunkGen) {
            if (!captureExceeded) {
              snapshotByteTotal += chunk.byteLength;
              if (snapshotByteTotal <= capBytes) {
                snapshotChunks.push(chunk);
              } else {
                snapshotChunks.length = 0;
                captureExceeded = true;
              }
            }
            yield chunk;
            if (showProgress) {
              processedRows = Math.min(totalRows, processedRows + chunkRows);
              const pct = Math.min(99, Math.round((processedRows / Math.max(1, totalRows)) * 100));
              setStatusMsg(`Saving ${fileName} (${pct}%)...`);
            }
          }
        })();
        await adapter.saveCsvStream(trackedChunks);
        if (!captureExceeded && snapshotChunks.length > 0) {
          const merged = new Uint8Array(snapshotByteTotal);
          let offset = 0;
          for (const c of snapshotChunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          savedBytesForSnapshot = merged;
        }
      } else {
        const bytes = serializeCurrentCsv();
        if (!bytes) return;
        await adapter.saveCsv(bytes);
        savedBytesForSnapshot = bytes;
      }
      setDirtyCsv(false);
      setStatusMsg(`Saved ${fileName} (${rowsRef.current.length.toLocaleString()} rows)`);
      onAfterSaveSnapshot?.(savedBytesForSnapshot, `Saved ${fileName}`);
    } catch (err) {
      console.error('[MetaText] Save failed:', err);
      setStatusMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [
    isReadOnly,
    dirtyCsv,
    csvData,
    adapter,
    serializeCurrentCsv,
    fileName,
    rowsRef,
    metaTextRef,
    setDirtyCsv,
    setStatusMsg,
    onAfterSaveSnapshot,
    maxSnapshotDataBytes,
    skipSnapshotBytesCapture,
  ]);

  const handleSaveAs = useCallback(async () => {
    if (!onSaveAs && !onSaveAsStream) return;
    if (!csvData) return;
    const isCsvOrTsv = !csvData.format || csvData.format === 'csv' || csvData.format === 'tsv';
    let saved: boolean | void = false;
    if (isCsvOrTsv && onSaveAsStream) {
      const chunkRows = 20_000;
      const totalRows = rowsRef.current.length;
      const showProgress = totalRows >= 50_000;
      const trackedChunks = (function* () {
        if (showProgress) {
          setStatusMsg(`Saving as new file (0%)...`);
        }
        let processedRows = 0;
        for (const chunk of iterateSerializedCsvChunks(
          csvData.headers,
          rowsRef.current,
          csvData.dialect,
          chunkRows,
        )) {
          yield chunk;
          if (showProgress) {
            processedRows = Math.min(totalRows, processedRows + chunkRows);
            const pct = Math.min(99, Math.round((processedRows / Math.max(1, totalRows)) * 100));
            setStatusMsg(`Saving as new file (${pct}%)...`);
          }
        }
      })();
      saved = await onSaveAsStream(trackedChunks, metaTextRef.current ?? '');
    } else if (onSaveAs) {
      const bytes = serializeCurrentCsv();
      if (!bytes) return;
      saved = await onSaveAs(bytes, metaTextRef.current ?? '');
    }
    if (saved !== false) {
      setDirtyCsv(false);
      setStatusMsg('Saved as new file');
    }
  }, [
    csvData,
    onSaveAs,
    onSaveAsStream,
    serializeCurrentCsv,
    rowsRef,
    metaTextRef,
    setDirtyCsv,
    setStatusMsg,
  ]);

  const handleNewFileAction = useCallback(
    (format?: NewFileFormat) => {
      if (!onNewFile) return;
      if (
        hostMode !== 'desktop' &&
        dirtyCsv &&
        !window.confirm('Discard unsaved changes and create a new file?')
      ) {
        return;
      }
      onNewFile(format);
    },
    [onNewFile, hostMode, dirtyCsv],
  );

  const handleCloseFileAction = useCallback(() => {
    if (!onCloseFile) return;
    if (dirtyCsv && !window.confirm('Discard unsaved changes and close this file?')) {
      return;
    }
    onCloseFile();
  }, [onCloseFile, dirtyCsv]);

  const buildUndoTarget = useCallback((): UndoApplyTarget => {
    return {
      rows: rowsRef.current,
      headers: csvData?.headers,
      columnKeys: csvData?.columnKeys,
      autoWidths,
      onColumnsChanged: ({ headers, columnKeys, autoWidths: nextWidths }) => {
        setCsvData((prev) => (prev ? { ...prev, headers, columnKeys } : prev));
        setAutoWidths(nextWidths);
      },
      onMetaTextChange: (nextMetaText) => {
        scheduleMetaSave(nextMetaText, { skipHistory: true });
      },
    };
  }, [rowsRef, csvData, autoWidths, setCsvData, setAutoWidths, scheduleMetaSave]);

  const applyUndoLocal = useCallback(() => {
    const next = historyRef.current.peekUndo();
    if (!next) return false;
    if (isReadOnly && next.touchesData) return false;
    const entry = historyRef.current.undoEntry(buildUndoTarget());
    if (entry) {
      if (entry.touchesData) {
        setDirtyCsv(true);
      }
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, [isReadOnly, historyRef, buildUndoTarget, setDirtyCsv, setDataVersion]);

  const applyRedoLocal = useCallback(() => {
    const next = historyRef.current.peekRedo();
    if (!next) return false;
    if (isReadOnly && next.touchesData) return false;
    const entry = historyRef.current.redoEntry(buildUndoTarget());
    if (entry) {
      if (entry.touchesData) {
        setDirtyCsv(true);
      }
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, [isReadOnly, historyRef, buildUndoTarget, setDirtyCsv, setDataVersion]);

  const jumpToHistoryCursor = useCallback(
    (targetCursor: number) => {
      const currentCursor = historyRef.current.getCursor();
      if (targetCursor === currentCursor) return false;
      if (isReadOnly) {
        // Block jump if any step in the span mutates CSV data
        const entries = historyRef.current.getEntries();
        const lo = Math.min(currentCursor, targetCursor);
        const hi = Math.max(currentCursor, targetCursor);
        for (let i = lo; i < hi; i++) {
          if (entries[i]?.touchesData) return false;
        }
      }
      const res = historyRef.current.jumpTo(targetCursor, buildUndoTarget());
      if (res.applied.length > 0) {
        if (res.touchedData) {
          setDirtyCsv(true);
        }
        setDataVersion((v) => v + 1);
        onDocumentEdit?.(`Jump history (${res.applied.length} step${res.applied.length === 1 ? '' : 's'})`);
        return true;
      }
      return false;
    },
    [isReadOnly, historyRef, buildUndoTarget, setDirtyCsv, setDataVersion, onDocumentEdit],
  );

  const handleUndo = useCallback(() => {
    if (applyUndoLocal()) {
      onDocumentEdit?.('Undo');
    }
  }, [applyUndoLocal, onDocumentEdit]);

  const handleRedo = useCallback(() => {
    if (applyRedoLocal()) {
      onDocumentEdit?.('Redo');
    }
  }, [applyRedoLocal, onDocumentEdit]);

  return {
    serializeCurrentCsv,
    handleSaveCsv,
    handleSaveAs,
    handleNewFileAction,
    handleCloseFileAction,
    applyUndoLocal,
    applyRedoLocal,
    jumpToHistoryCursor,
    handleUndo,
    handleRedo,
  };
}
