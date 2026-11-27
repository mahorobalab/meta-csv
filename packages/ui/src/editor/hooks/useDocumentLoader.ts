import { useCallback, useEffect, useRef } from 'react';
import type { MetaTextDocument, MetaTextFormat } from '@metatext-editor/schema';
import {
  UndoRedoHistory,
  detectTargetFormat,
  parseMetaJsonc,
  patchMetaJsonc,
  type FileSystemAdapter,
  type ParseProgress,
  type ParsedCsvData,
} from '@metatext-editor/core';
import { parseTabularInWorker } from '../../parseInWorker';
import type { EditorViewSnapshot } from '../types';

export interface MetaSaveOptions {
  skipHistory?: boolean;
  label?: string;
}

function inferMetaHistoryLabel(path: Array<string | number>): string {
  const root = String(path[0] ?? '');
  const sub = String(path[1] ?? '');
  const leaf = String(path[2] ?? '');
  if (root === 'view' && sub === 'markers') return 'Update markers';
  if (root === 'view' && sub === 'sort') return 'Change sort';
  if (root === 'columns' && leaf === 'width') return 'Resize column';
  if (root === 'columns' && leaf === 'visible') return 'Toggle column visibility';
  if (root === 'columns' && leaf === 'label') return 'Rename column label';
  if (root === 'columns') return 'Update column style';
  if (root === 'rows') return 'Update row style';
  if (root === 'cells' || root === 'ranges') return 'Update cell style';
  if (root === 'rules') return 'Update conditional rules';
  if (root === 'table') return 'Update table settings';
  return 'Update metadata';
}

export interface UseDocumentLoaderParams {
  adapter: FileSystemAdapter;
  reloadTick: number;
  setReloadTick: React.Dispatch<React.SetStateAction<number>>;
  filePath?: string;
  externalMetaText?: string | null;
  onMetaTextChange?: (text: string) => void;
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  activeFormat: MetaTextFormat;
  setActiveFormat: React.Dispatch<React.SetStateAction<MetaTextFormat>>;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
  setFileBytes: React.Dispatch<React.SetStateAction<number>>;
  setMeta: React.Dispatch<React.SetStateAction<MetaTextDocument>>;
  setIsReadOnly: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  setDirtyCsv: React.Dispatch<React.SetStateAction<boolean>>;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: React.Dispatch<React.SetStateAction<string>>;
  setOpenMenu: React.Dispatch<React.SetStateAction<'none' | 'file' | 'edit' | 'unlock'>>;
  setOnlyMarked: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterQuery: React.Dispatch<React.SetStateAction<string>>;
  setDebouncedFilterQuery: React.Dispatch<React.SetStateAction<string>>;
  setFilterContextRows: React.Dispatch<React.SetStateAction<number>>;
  setLoadingProgress: React.Dispatch<React.SetStateAction<ParseProgress | null>>;
  setShowProgressOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  rowsRef: React.MutableRefObject<string[][]>;
  historyRef: React.MutableRefObject<UndoRedoHistory>;
  metaTextRef: React.MutableRefObject<string | null>;
  pendingRestoreSnapshotRef: React.MutableRefObject<EditorViewSnapshot | null>;
}

export function useDocumentLoader({
  adapter,
  reloadTick,
  setReloadTick,
  filePath,
  externalMetaText,
  onMetaTextChange,
  csvData,
  setCsvData,
  activeFormat,
  setActiveFormat,
  setFileName,
  setFileBytes,
  setMeta,
  setIsReadOnly,
  setAutoWidths,
  setDirtyCsv,
  setDataVersion,
  setStatusMsg,
  setOpenMenu,
  setOnlyMarked,
  setFilterQuery,
  setDebouncedFilterQuery,
  setFilterContextRows,
  setLoadingProgress,
  setShowProgressOverlay,
  rowsRef,
  historyRef,
  metaTextRef,
  pendingRestoreSnapshotRef,
}: UseDocumentLoaderParams) {
  const metaSaveTimerRef = useRef<number | null>(null);
  const isLoadingRef = useRef(false);
  const prevAdapterRef = useRef<FileSystemAdapter | null>(null);
  const logConfigKeyRef = useRef<string>('{}');

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    isLoadingRef.current = true;

    if (prevAdapterRef.current !== adapter) {
      prevAdapterRef.current = adapter;
      rowsRef.current = [];
      setCsvData(null);
      if (!pendingRestoreSnapshotRef.current) {
        setOnlyMarked(false);
      }
    }

    setStatusMsg('Loading file...');
    setOpenMenu('none');
    setLoadingProgress({ phase: 'decoding', percent: 0, rowsParsed: 0 });
    setShowProgressOverlay(false);
    historyRef.current.clear();
    setDirtyCsv(false);

    const overlayTimer = window.setTimeout(() => {
      if (!cancelled) setShowProgressOverlay(true);
    }, 150);

    adapter
      .load()
      .then(async (payload) => {
        if (cancelled) return;
        const parsedMeta = parseMetaJsonc(payload.metaText);
        const normalizedMetaText = payload.metaText ?? '';
        const resolvedFormat = detectTargetFormat(payload.fileName, parsedMeta.format);
        const initialReadOnly =
          parsedMeta.readOnly ?? (resolvedFormat === 'jsonl' || resolvedFormat === 'log');

        setFileName(payload.fileName);
        setFileBytes(payload.csvBytes.byteLength);
        setMeta(parsedMeta);
        setActiveFormat(resolvedFormat);
        setIsReadOnly(initialReadOnly);
        metaTextRef.current = normalizedMetaText;
        onMetaTextChange?.(normalizedMetaText);
        if (!pendingRestoreSnapshotRef.current) {
          setFilterQuery(parsedMeta.view?.activeFilter ?? '');
          setDebouncedFilterQuery(parsedMeta.view?.activeFilter ?? '');
          setFilterContextRows(parsedMeta.view?.filterContextRows ?? 0);
        }
        logConfigKeyRef.current = JSON.stringify({
          linePattern: parsedMeta.log?.linePattern,
          columnNames: parsedMeta.log?.columnNames,
          multilinePattern: parsedMeta.log?.multilinePattern,
          encoding: parsedMeta.log?.encoding,
        });

        const { parsed, autoWidths: widths, elapsedMs } = await parseTabularInWorker(
          payload.csvBytes,
          {
            format: resolvedFormat,
            csv: parsedMeta.csv,
            jsonl: parsedMeta.jsonl,
            log: parsedMeta.log,
          },
          (prog) => {
            if (!cancelled) setLoadingProgress(prog);
          },
          abortController.signal,
        );
        if (cancelled) return;

        rowsRef.current = parsed.rows;
        setCsvData(parsed);
        setAutoWidths(widths);
        setDataVersion((v) => v + 1);
        setStatusMsg('');
        console.info(
          `[MetaText] Loaded ${payload.fileName} (${resolvedFormat}): ${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} cols in ${elapsedMs} ms`,
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setStatusMsg(`Load error: ${String(err)}`);
        }
      })
      .finally(() => {
        window.clearTimeout(overlayTimer);
        if (!cancelled) {
          isLoadingRef.current = false;
          setLoadingProgress(null);
          setShowProgressOverlay(false);
        }
      });

    return () => {
      cancelled = true;
      isLoadingRef.current = false;
      abortController.abort();
      window.clearTimeout(overlayTimer);
    };
  }, [adapter, reloadTick]);

  useEffect(() => {
    if (!filePath) return;
    const parts = filePath.split(/[\\/]/);
    const nextName = parts[parts.length - 1];
    if (nextName) setFileName(nextName);
  }, [filePath, setFileName]);

  useEffect(() => {
    return () => {
      rowsRef.current = [];
      historyRef.current.clear();
    };
  }, [rowsRef, historyRef]);

  const applyParsedMetaAndReparseIfNeeded = useCallback(
    (nextText: string | null) => {
      const nextMeta = parseMetaJsonc(nextText);
      metaTextRef.current = nextText ?? '';
      setMeta(nextMeta);
      if (nextMeta.readOnly !== undefined) {
        setIsReadOnly(nextMeta.readOnly);
      }

      if (csvData) {
        if (nextMeta.format && nextMeta.format !== activeFormat) {
          setReloadTick((t) => t + 1);
          return;
        }
        if (csvData.format === 'jsonl') {
          const prevDepth = csvData.jsonlOptions?.flattenDepth ?? 2;
          const nextDepth = nextMeta.jsonl?.flattenDepth ?? 2;
          const prevArr = csvData.jsonlOptions?.arrayMode ?? 'json';
          const nextArr = nextMeta.jsonl?.arrayMode ?? 'json';
          if (prevDepth !== nextDepth || prevArr !== nextArr) {
            setReloadTick((t) => t + 1);
          }
        } else if (csvData.format === 'log' || csvData.format === 'text') {
          const nextLogKey = JSON.stringify({
            linePattern: nextMeta.log?.linePattern,
            columnNames: nextMeta.log?.columnNames,
            multilinePattern: nextMeta.log?.multilinePattern,
            encoding: nextMeta.log?.encoding,
          });
          if (nextLogKey !== logConfigKeyRef.current) {
            setReloadTick((t) => t + 1);
          }
        } else {
          const prevHasHeader = csvData.dialect.hasHeader;
          const nextHasHeader = nextMeta.csv?.hasHeader ?? true;
          if (prevHasHeader !== nextHasHeader) {
            setReloadTick((t) => t + 1);
          }
        }
      }
    },
    [csvData, activeFormat, metaTextRef, setMeta, setIsReadOnly, setReloadTick],
  );

  useEffect(() => {
    if (isLoadingRef.current) return;
    if (externalMetaText === undefined) return;
    if ((externalMetaText ?? '') === (metaTextRef.current ?? '')) {
      return;
    }
    try {
      applyParsedMetaAndReparseIfNeeded(externalMetaText);
    } catch {
      // Ignore transient syntax errors while user is typing
    }
  }, [externalMetaText, applyParsedMetaAndReparseIfNeeded, metaTextRef]);

  const scheduleMetaSave = useCallback(
    (nextText: string, options?: MetaSaveOptions) => {
      const prevText = metaTextRef.current ?? '';
      if (!options?.skipHistory && prevText !== nextText) {
        historyRef.current.push(
          { type: 'metaChange', beforeMetaText: prevText, afterMetaText: nextText },
          options?.label ?? 'Update metadata',
        );
      }
      applyParsedMetaAndReparseIfNeeded(nextText);
      onMetaTextChange?.(nextText);

      if (metaSaveTimerRef.current !== null) {
        window.clearTimeout(metaSaveTimerRef.current);
      }
      metaSaveTimerRef.current = window.setTimeout(() => {
        void adapter.saveMeta(nextText);
      }, 400);
    },
    [adapter, applyParsedMetaAndReparseIfNeeded, historyRef, metaTextRef, onMetaTextChange],
  );

  const patchMeta = useCallback(
    (path: Array<string | number>, value: unknown, options?: MetaSaveOptions) => {
      const updated = patchMetaJsonc(metaTextRef.current, path, value);
      scheduleMetaSave(updated, {
        skipHistory: options?.skipHistory,
        label: options?.label ?? inferMetaHistoryLabel(path),
      });
    },
    [scheduleMetaSave, metaTextRef],
  );

  return { scheduleMetaSave, patchMeta };
}
