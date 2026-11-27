import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataEditorRef } from '@glideapps/glide-data-grid';
import type { MetaTextDocument, MetaTextFormat } from '@metatext-editor/schema';
import {
  decodeCsvBytes,
  parseCsvBytes,
  parseJsonlBytes,
  parseLogLines,
  type FileSystemAdapter,
  type ParsedCsvData,
} from '@metatext-editor/core';

export type TailLogLevel = 'error' | 'warn' | 'debug' | 'info' | 'default';

export interface TailLineEntry {
  id: number;
  lineNo: number;
  text: string;
  cells: string[];
  level: TailLogLevel;
  isLive: boolean;
}

export const DEFAULT_TAIL_MAX_LINES = 20;
const TAIL_POLL_MS = 500;

export function detectTailLineLevel(text: string): TailLogLevel {
  const upper = text.toUpperCase();
  if (/\b(FATAL|ERROR|ERR|EXCEPTION|CRITICAL|PANIC)\b/.test(upper)) return 'error';
  if (/\b(WARN|WARNING)\b/.test(upper)) return 'warn';
  if (/\b(DEBUG|TRACE)\b/.test(upper)) return 'debug';
  if (/\bINFO\b/.test(upper)) return 'info';
  return 'default';
}

function alignParsedRowsToColumns(
  sourceKeys: string[],
  sourceRows: string[][],
  targetKeys: string[],
): string[][] {
  if (
    sourceKeys.length === targetKeys.length &&
    sourceKeys.every((k, i) => k === targetKeys[i])
  ) {
    return sourceRows;
  }
  const srcIndexByKey = new Map<string, number>();
  sourceKeys.forEach((k, i) => srcIndexByKey.set(k, i));

  return sourceRows.map((row) =>
    targetKeys.map((targetKey, idx) => {
      const mapped = srcIndexByKey.get(targetKey);
      if (mapped !== undefined) return row[mapped] ?? '';
      if (targetKey === '_raw') return row[row.length - 1] ?? '';
      return row[idx] ?? '';
    }),
  );
}

export interface UseLiveTailParams {
  adapter: FileSystemAdapter;
  isActive: boolean;
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
  activeFormat: MetaTextFormat;
  fileBytes: number;
  rowsRef: React.MutableRefObject<string[][]>;
  gridRef: React.RefObject<DataEditorRef | null>;
  viewRowCount: number;
  appendRowsToOrder: (appendedDataRows: number[]) => void;
  setFileBytes: (bytes: number) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setReloadTick: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
}

export function useLiveTail({
  adapter,
  isActive,
  csvData,
  meta,
  activeFormat,
  fileBytes,
  rowsRef,
  gridRef,
  viewRowCount,
  appendRowsToOrder,
  setFileBytes,
  setDataVersion,
  setReloadTick,
  setStatusMsg,
}: UseLiveTailParams) {
  const canTail = typeof adapter.readAppend === 'function';
  const [tailFollowGrid, setTailFollowGrid] = useState(false);
  const [showTailPanel, setShowTailPanel] = useState(false);
  const [tailPanelPaused, setTailPanelPaused] = useState(false);
  const [tailMaxLines, setTailMaxLinesState] = useState<number | null>(DEFAULT_TAIL_MAX_LINES);
  const [tailLines, setTailLines] = useState<TailLineEntry[]>([]);

  const byteOffsetRef = useRef<number>(fileBytes);
  const pendingPartialRef = useRef<string>('');
  const inFlightRef = useRef<boolean>(false);
  const nextEntryIdRef = useRef<number>(1);
  const viewRowCountRef = useRef<number>(viewRowCount);
  const tailMaxLinesRef = useRef<number | null>(tailMaxLines);
  viewRowCountRef.current = viewRowCount;
  tailMaxLinesRef.current = tailMaxLines;

  const setTailMaxLines = useCallback((nextLimit: number | null) => {
    setTailMaxLinesState(nextLimit);
    if (nextLimit !== null) {
      setTailLines((prev) => (prev.length > nextLimit ? prev.slice(prev.length - nextLimit) : prev));
    }
  }, []);

  // Reset offset & buffer when switching file/adapter or reloading from scratch
  useEffect(() => {
    byteOffsetRef.current = fileBytes;
  }, [fileBytes]);

  useEffect(() => {
    pendingPartialRef.current = '';
    setTailLines([]);
  }, [adapter]);

  const seedTailPanelFromRows = useCallback(() => {
    const allRows = rowsRef.current;
    if (allRows.length === 0) return;
    const start = Math.max(0, allRows.length - 40);
    const seeded: TailLineEntry[] = [];
    for (let i = start; i < allRows.length; i++) {
      const row = allRows[i] ?? [];
      const raw = row.filter((c) => c.length > 0).join(' | ');
      seeded.push({
        id: nextEntryIdRef.current++,
        lineNo: i + 1,
        text: raw,
        cells: row,
        level: detectTailLineLevel(raw),
        isLive: false,
      });
    }
    setTailLines(seeded);
  }, [rowsRef]);

  const toggleTailFollowGrid = useCallback(() => {
    if (!canTail) return;
    setTailFollowGrid((prev) => {
      const next = !prev;
      if (next && viewRowCountRef.current > 0) {
        gridRef.current?.scrollTo(0, viewRowCountRef.current - 1, 'vertical');
      }
      return next;
    });
  }, [canTail, gridRef]);

  const toggleTailPanel = useCallback(() => {
    if (!canTail) return;
    setShowTailPanel((prev) => {
      const next = !prev;
      if (!next) {
        setTailFollowGrid(false);
      } else {
        setTailPanelPaused(false);
        setTailLines((cur) => {
          if (cur.length > 0) return cur;
          const allRows = rowsRef.current;
          const seedCount = tailMaxLinesRef.current ?? DEFAULT_TAIL_MAX_LINES;
          const start = Math.max(0, allRows.length - seedCount);
          const seeded: TailLineEntry[] = [];
          for (let i = start; i < allRows.length; i++) {
            const row = allRows[i] ?? [];
            const raw = row.filter((c) => c.length > 0).join(' | ');
            seeded.push({
              id: nextEntryIdRef.current++,
              lineNo: i + 1,
              text: raw,
              cells: row,
              level: detectTailLineLevel(raw),
              isLive: false,
            });
          }
          return seeded;
        });
      }
      return next;
    });
  }, [canTail, rowsRef]);

  const clearTailLines = useCallback(() => {
    setTailLines([]);
  }, []);

  const isMonitoring = canTail && isActive && Boolean(csvData) && (tailFollowGrid || showTailPanel);

  useEffect(() => {
    if (!isMonitoring || !adapter.readAppend || !csvData) return;
    let cancelled = false;

    const pollOnce = async () => {
      if (cancelled || inFlightRef.current || !adapter.readAppend) return;
      inFlightRef.current = true;
      try {
        const res = await adapter.readAppend(byteOffsetRef.current);
        if (cancelled) return;

        if (res.truncated) {
          pendingPartialRef.current = '';
          byteOffsetRef.current = 0;
          setStatusMsg('Log rotated / truncated — reloading...');
          setReloadTick((t) => t + 1);
          return;
        }

        if (res.bytes.byteLength === 0) return;

        byteOffsetRef.current = res.nextOffset;
        setFileBytes(res.nextOffset);

        const { text: decoded } = decodeCsvBytes(res.bytes, csvData.dialect.encoding);
        const combined = pendingPartialRef.current + decoded;
        const endsWithNewline = combined.endsWith('\n') || combined.endsWith('\r');
        const splitLines = combined.split(/\r?\n/);

        let completeLines: string[];
        if (endsWithNewline) {
          pendingPartialRef.current = '';
          // Drop trailing empty string produced by final newline
          if (splitLines.length > 0 && splitLines[splitLines.length - 1] === '') {
            splitLines.pop();
          }
          completeLines = splitLines;
        } else {
          pendingPartialRef.current = splitLines.pop() ?? '';
          completeLines = splitLines;
        }

        const nonEmptyLines = completeLines.filter((l) => l.length > 0);
        if (nonEmptyLines.length === 0) return;

        // Parse incrementally according to activeFormat (including auto-detected docker-json logs)
        let newRows: string[][] = [];
        const isJsonLog =
          activeFormat === 'jsonl' ||
          ((activeFormat === 'log' || activeFormat === 'text') &&
            csvData.logOptions?.matchedPresetId === 'docker-json');

        if (isJsonLog) {
          const chunkBytes = new TextEncoder().encode(nonEmptyLines.join('\n') + '\n');
          const parsed = parseJsonlBytes(chunkBytes, {
            flattenDepth: meta.jsonl?.flattenDepth ?? csvData.jsonlOptions?.flattenDepth ?? 2,
            arrayMode: meta.jsonl?.arrayMode ?? csvData.jsonlOptions?.arrayMode ?? 'json',
            encoding: 'utf-8',
          });
          newRows = alignParsedRowsToColumns(parsed.columnKeys, parsed.rows, csvData.columnKeys);
        } else if (activeFormat === 'log' || activeFormat === 'text') {
          const resolvedPattern = meta.log?.linePattern ?? csvData.logOptions?.linePattern;
          const parsed = parseLogLines(nonEmptyLines, {
            linePattern:
              resolvedPattern && resolvedPattern.length > 0 ? resolvedPattern : undefined,
            columnNames: meta.log?.columnNames ?? csvData.logOptions?.columnNames,
            multilinePattern: meta.log?.multilinePattern ?? csvData.logOptions?.multilinePattern,
            wordWrap: meta.log?.wordWrap ?? csvData.logOptions?.wordWrap,
            encoding: csvData.dialect.encoding,
          });
          newRows = alignParsedRowsToColumns(parsed.columnKeys, parsed.rows, csvData.columnKeys);
        } else {
          const chunkBytes = new TextEncoder().encode(nonEmptyLines.join('\n') + '\n');
          const parsed = parseCsvBytes(chunkBytes, {
            ...csvData.dialect,
            encoding: 'utf-8',
            hasHeader: false,
          });
          const colCount = csvData.columnKeys.length;
          newRows = parsed.rows.map((r) => {
            if (r.length === colCount) return r;
            const out = r.slice(0, colCount);
            while (out.length < colCount) out.push('');
            return out;
          });
        }

        if (newRows.length > 0) {
          const startIdx = rowsRef.current.length;
          const appendedIndices: number[] = [];
          for (let i = 0; i < newRows.length; i++) {
            rowsRef.current.push(newRows[i]!);
            appendedIndices.push(startIdx + i);
          }
          appendRowsToOrder(appendedIndices);
          setDataVersion((v) => v + 1);

          // Push parsed cells + raw lines into independent Live Tail panel buffer
          const entries: TailLineEntry[] = newRows.map((rowCells, i) => {
            const rawLine = nonEmptyLines[i] ?? rowCells.filter((c) => c.length > 0).join(' | ');
            return {
              id: nextEntryIdRef.current++,
              lineNo: startIdx + i + 1,
              text: rawLine,
              cells: rowCells,
              level: detectTailLineLevel(rawLine),
              isLive: true,
            };
          });
          setTailLines((prev) => {
            const merged = prev.concat(entries);
            const limit = tailMaxLinesRef.current;
            return limit !== null && merged.length > limit
              ? merged.slice(merged.length - limit)
              : merged;
          });

          if (tailFollowGrid) {
            const targetRow = viewRowCountRef.current + appendedIndices.length - 1;
            window.requestAnimationFrame(() => {
              if (targetRow >= 0) {
                gridRef.current?.scrollTo(0, targetRow, 'vertical');
              }
            });
          }
        }
      } catch {
        // Ignore transient read errors while external writer is flushing
      } finally {
        inFlightRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void pollOnce();
    }, TAIL_POLL_MS);
    void pollOnce();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    isMonitoring,
    adapter,
    csvData,
    activeFormat,
    meta.log,
    meta.jsonl,
    rowsRef,
    gridRef,
    appendRowsToOrder,
    setFileBytes,
    setDataVersion,
    setReloadTick,
    setStatusMsg,
    tailFollowGrid,
  ]);

  return {
    canTail,
    isMonitoring,
    tailFollowGrid,
    showTailPanel,
    tailPanelPaused,
    tailMaxLines,
    tailLines,
    setTailPanelPaused,
    setTailMaxLines,
    toggleTailFollowGrid,
    toggleTailPanel,
    clearTailLines,
    seedTailPanelFromRows,
  };
}
