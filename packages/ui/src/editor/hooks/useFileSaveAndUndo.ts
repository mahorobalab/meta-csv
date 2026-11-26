import { useCallback } from 'react';
import {
  UndoRedoHistory,
  iterateSerializedCsvChunks,
  serializeCsv,
  serializeJsonl,
  serializeLog,
  type FileSystemAdapter,
  type ParsedCsvData,
} from '@metatext-editor/core';
import type { EditorHostMode } from '../../SettingsAboutDialogs';

export interface UseFileSaveAndUndoParams {
  adapter: FileSystemAdapter;
  hostMode: EditorHostMode;
  csvData: ParsedCsvData | null;
  fileName: string;
  isReadOnly: boolean;
  dirtyCsv: boolean;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  rowsRef: React.MutableRefObject<string[][]>;
  metaTextRef: React.MutableRefObject<string | null>;
  historyRef: React.MutableRefObject<UndoRedoHistory>;
  onNewFile?: () => void;
  onSaveAs?: (bytes: Uint8Array, metaText: string) => Promise<boolean | void> | boolean | void;
  onSaveAsStream?: (
    chunks: Iterable<Uint8Array>,
    metaText: string,
  ) => Promise<boolean | void> | boolean | void;
  onCloseFile?: () => void;
  onDocumentEdit?: (label: string) => void;
}

export function useFileSaveAndUndo({
  adapter,
  hostMode,
  csvData,
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
    if (isReadOnly) {
      setStatusMsg('Read-Only mode — unlock to save changes');
      return;
    }
    if (!csvData) return;
    const isCsvOrTsv = !csvData.format || csvData.format === 'csv' || csvData.format === 'tsv';
    if (isCsvOrTsv && adapter.saveCsvStream) {
      const chunkRows = 20_000;
      const totalRows = rowsRef.current.length;
      const showProgress = totalRows >= 50_000;
      if (showProgress) {
        setStatusMsg(`Saving ${fileName} (0%)...`);
      }
      const chunkGen = iterateSerializedCsvChunks(
        csvData.headers,
        rowsRef.current,
        csvData.dialect,
        chunkRows,
      );
      const trackedChunks = (function* () {
        let processedRows = 0;
        for (const chunk of chunkGen) {
          yield chunk;
          if (showProgress) {
            processedRows = Math.min(totalRows, processedRows + chunkRows);
            const pct = Math.min(99, Math.round((processedRows / Math.max(1, totalRows)) * 100));
            setStatusMsg(`Saving ${fileName} (${pct}%)...`);
          }
        }
      })();
      await adapter.saveCsvStream(trackedChunks);
    } else {
      const bytes = serializeCurrentCsv();
      if (!bytes) return;
      await adapter.saveCsv(bytes);
    }
    setDirtyCsv(false);
    setStatusMsg(`Saved ${fileName} (${rowsRef.current.length.toLocaleString()} rows)`);
  }, [isReadOnly, csvData, adapter, serializeCurrentCsv, fileName, rowsRef, setDirtyCsv, setStatusMsg]);

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

  const handleNewFileAction = useCallback(() => {
    if (!onNewFile) return;
    if (
      hostMode !== 'desktop' &&
      dirtyCsv &&
      !window.confirm('Discard unsaved changes and create a new file?')
    ) {
      return;
    }
    onNewFile();
  }, [onNewFile, hostMode, dirtyCsv]);

  const handleCloseFileAction = useCallback(() => {
    if (!onCloseFile) return;
    if (dirtyCsv && !window.confirm('Discard unsaved changes and close this file?')) {
      return;
    }
    onCloseFile();
  }, [onCloseFile, dirtyCsv]);

  const applyUndoLocal = useCallback(() => {
    if (isReadOnly) return false;
    const cmd = historyRef.current.undo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, [isReadOnly, historyRef, rowsRef, setDirtyCsv, setDataVersion]);

  const applyRedoLocal = useCallback(() => {
    if (isReadOnly) return false;
    const cmd = historyRef.current.redo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, [isReadOnly, historyRef, rowsRef, setDirtyCsv, setDataVersion]);

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
    handleUndo,
    handleRedo,
  };
}
