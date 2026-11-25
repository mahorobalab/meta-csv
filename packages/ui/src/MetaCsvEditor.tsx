import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  type CellStyle,
  type MetaCsvDocument,
  type RangeStyleRule,
  type SortSpec,
} from '@meta-csv/schema';
import {
  UndoRedoHistory,
  buildSortedRowIndices,
  createStyleResolverContext,
  parseMetaJsonc,
  patchMetaJsonc,
  resolveCellStyle,
  searchVisibleRows,
  serializeCsv,
  type FileSystemAdapter,
  type ParseProgress,
  type ParsedCsvData,
  type SearchMatch,
} from '@meta-csv/core';
import { buildGridTheme } from './theme';
import { parseCsvInWorker } from './parseInWorker';

export interface MetaCsvEditorProps {
  adapter: FileSystemAdapter;
  themeMode?: 'light' | 'dark';
  /** Optional external JSONC text override (for live playground editing) */
  externalMetaText?: string | null;
  onMetaTextChange?: (text: string) => void;
}

const SWATCH_COLORS = [
  { label: 'Clear', value: undefined },
  { label: 'Blue', value: 'rgba(59, 130, 246, 0.20)' },
  { label: 'Green', value: 'rgba(16, 185, 129, 0.20)' },
  { label: 'Amber', value: 'rgba(245, 158, 11, 0.22)' },
  { label: 'Rose', value: 'rgba(244, 63, 94, 0.20)' },
];

export const MetaCsvEditor: React.FC<MetaCsvEditorProps> = ({
  adapter,
  themeMode = 'dark',
  externalMetaText,
  onMetaTextChange,
}) => {
  const [fileName, setFileName] = useState<string>('');
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null);
  const [meta, setMeta] = useState<MetaCsvDocument>({ version: '0.1' });
  const [autoWidths, setAutoWidths] = useState<number[]>([]);
  const [dirtyCsv, setDirtyCsv] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Loading...');
  const [dataVersion, setDataVersion] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<ParseProgress | null>(null);
  const [showProgressOverlay, setShowProgressOverlay] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Selection state
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  const gridRef = useRef<DataEditorRef | null>(null);
  const rowsRef = useRef<string[][]>([]);
  const historyRef = useRef(new UndoRedoHistory());
  const metaSaveTimerRef = useRef<number | null>(null);
  const metaTextRef = useRef<string | null>(null);

  // Load from adapter & parse in Web Worker (releasing raw CSV bytes right after parse)
  useEffect(() => {
    let cancelled = false;
    setStatusMsg('Loading CSV...');
    setLoadingProgress({ phase: 'decoding', percent: 0, rowsParsed: 0 });
    setShowProgressOverlay(false);
    historyRef.current.clear();
    setDirtyCsv(false);

    // Only show the overlay if loading takes longer than 150ms (avoids flicker on small files)
    const overlayTimer = window.setTimeout(() => {
      if (!cancelled) setShowProgressOverlay(true);
    }, 150);

    adapter
      .load()
      .then(async (payload) => {
        if (cancelled) return;
        const parsedMeta = parseMetaJsonc(payload.metaText);
        setFileName(payload.fileName);
        setMeta(parsedMeta);
        metaTextRef.current = payload.metaText;
        onMetaTextChange?.(payload.metaText ?? '');

        const { parsed, autoWidths: widths, elapsedMs } = await parseCsvInWorker(
          payload.csvBytes,
          parsedMeta.csv,
          (prog) => {
            if (!cancelled) setLoadingProgress(prog);
          },
        );
        if (cancelled) return;

        rowsRef.current = parsed.rows;
        setCsvData(parsed);
        setAutoWidths(widths);
        setDataVersion((v) => v + 1);
        setStatusMsg(
          `${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} cols (${elapsedMs} ms)`,
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
          setLoadingProgress(null);
          setShowProgressOverlay(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(overlayTimer);
    };
  }, [adapter, reloadTick]);

  const applyParsedMetaAndReparseIfNeeded = useCallback(
    (nextText: string | null) => {
      const nextMeta = parseMetaJsonc(nextText);
      metaTextRef.current = nextText;
      setMeta(nextMeta);

      if (csvData) {
        const prevHasHeader = csvData.dialect.hasHeader;
        const nextHasHeader = nextMeta.csv?.hasHeader ?? true;
        if (prevHasHeader !== nextHasHeader) {
          setReloadTick((t) => t + 1);
        }
      }
    },
    [csvData],
  );

  // Apply external JSONC edits (used by Playground side panel)
  useEffect(() => {
    if (externalMetaText === undefined || externalMetaText === metaTextRef.current) {
      return;
    }
    try {
      applyParsedMetaAndReparseIfNeeded(externalMetaText);
    } catch {
      // Ignore transient syntax errors while user is typing
    }
  }, [externalMetaText, applyParsedMetaAndReparseIfNeeded]);

  const scheduleMetaSave = useCallback(
    (nextText: string) => {
      applyParsedMetaAndReparseIfNeeded(nextText);
      onMetaTextChange?.(nextText);

      if (metaSaveTimerRef.current !== null) {
        window.clearTimeout(metaSaveTimerRef.current);
      }
      metaSaveTimerRef.current = window.setTimeout(() => {
        void adapter.saveMeta(nextText);
      }, 400);
    },
    [adapter, applyParsedMetaAndReparseIfNeeded, onMetaTextChange],
  );

  const patchMeta = useCallback(
    (path: Array<string | number>, value: unknown) => {
      const updated = patchMetaJsonc(metaTextRef.current, path, value);
      scheduleMetaSave(updated);
    },
    [scheduleMetaSave],
  );

  // Visible columns (respecting meta.columns[key].visible !== false)
  const visibleColIndices = useMemo(() => {
    if (!csvData) return [];
    const list: number[] = [];
    for (let i = 0; i < csvData.columnKeys.length; i++) {
      const key = csvData.columnKeys[i]!;
      if (meta.columns?.[key]?.visible === false) continue;
      list.push(i);
    }
    return list;
  }, [csvData, meta.columns]);

  // View row indices (non-destructive sort)
  const viewRowIndices = useMemo(() => {
    if (!csvData) return new Int32Array(0);
    return buildSortedRowIndices(rowsRef.current, csvData.columnKeys, meta.view?.sort);
  }, [csvData, meta.view?.sort, dataVersion]);

  // Style resolver context
  const styleCtx = useMemo(() => {
    if (!csvData) return null;
    return createStyleResolverContext(meta, csvData.columnKeys);
  }, [csvData, meta]);

  // Search execution
  useEffect(() => {
    if (!searchQuery.trim() || !csvData) {
      setMatches([]);
      setActiveMatchIdx(0);
      return;
    }
    const found = searchVisibleRows(rowsRef.current, viewRowIndices, searchQuery);
    setMatches(found);
    setActiveMatchIdx(0);
  }, [searchQuery, viewRowIndices, csvData, dataVersion]);

  const activeMatch = matches[activeMatchIdx];

  // Auto-scroll to active search match
  useEffect(() => {
    if (!activeMatch || !gridRef.current) return;
    const visCol = visibleColIndices.indexOf(activeMatch.col);
    if (visCol === -1) return;
    gridRef.current.scrollTo(visCol, activeMatch.viewRow, 'both', 0, 0, {
      vAlign: 'center',
      hAlign: 'center',
    });
  }, [activeMatch, visibleColIndices]);

  const matchSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) {
      s.add(`${m.dataRow}:${m.col}`);
    }
    return s;
  }, [matches]);

  // Grid columns definition
  const columns: GridColumn[] = useMemo(() => {
    if (!csvData) return [];
    const activeSort = meta.view?.sort?.[0];
    return visibleColIndices.map((actualColIdx) => {
      const key = csvData.columnKeys[actualColIdx]!;
      const colMeta = meta.columns?.[key];
      const baseTitle =
        colMeta?.label ?? csvData.headers[actualColIdx] ?? `column ${actualColIdx + 1}`;
      const sortIndicator =
        activeSort?.column === key
          ? activeSort.direction === 'asc'
            ? ' ▲'
            : ' ▼'
          : '';
      return {
        id: key,
        title: `${baseTitle}${sortIndicator}`,
        width: colMeta?.width ?? autoWidths[actualColIdx] ?? 140,
      };
    });
  }, [csvData, visibleColIndices, meta.columns, meta.view?.sort, autoWidths]);

  const gridTheme = useMemo(
    () => buildGridTheme(themeMode, meta.table),
    [themeMode, meta.table],
  );

  // Cell content provider (runs only for visible viewport cells)
  const getCellContent = useCallback(
    ([visibleCol, viewRow]: Item): GridCell => {
      const actualCol = visibleColIndices[visibleCol];
      const dataRow = viewRowIndices[viewRow];
      if (actualCol === undefined || dataRow === undefined || !csvData) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
      }

      const rowValues = rowsRef.current[dataRow] ?? [];
      const val = rowValues[actualCol] ?? '';
      const colKey = csvData.columnKeys[actualCol] ?? String(actualCol);
      const colMeta = meta.columns?.[colKey];

      const resolvedStyle: CellStyle | undefined = styleCtx
        ? resolveCellStyle(styleCtx, dataRow, actualCol, rowValues)
        : undefined;

      const isSearchHit = matchSet.has(`${dataRow}:${actualCol}`);
      const isCurrentHit =
        activeMatch !== undefined &&
        activeMatch.dataRow === dataRow &&
        activeMatch.col === actualCol;

      let themeOverride: Partial<Theme> | undefined;
      if (resolvedStyle || isSearchHit || colMeta?.readonly) {
        const fontSize = resolvedStyle?.fontSize ?? meta.table?.fontSize ?? DEFAULT_FONT_SIZE;
        const fontPrefix = [
          resolvedStyle?.italic ? 'italic' : '',
          resolvedStyle?.bold ? '700' : '',
        ]
          .filter(Boolean)
          .join(' ');

        themeOverride = {
          ...(resolvedStyle?.backgroundColor ? { bgCell: resolvedStyle.backgroundColor } : {}),
          ...(resolvedStyle?.color ? { textDark: resolvedStyle.color } : {}),
          ...(resolvedStyle?.fontFamily ? { fontFamily: resolvedStyle.fontFamily } : {}),
          ...(fontPrefix || resolvedStyle?.fontSize
            ? { baseFontStyle: `${fontPrefix} ${fontSize}px`.trim() }
            : {}),
          ...(colMeta?.readonly && !resolvedStyle?.color
            ? { textDark: themeMode === 'dark' ? '#94a3b8' : '#64748b' }
            : {}),
          ...(isSearchHit
            ? {
                bgCell: isCurrentHit
                  ? 'rgba(250, 204, 21, 0.55)'
                  : 'rgba(250, 204, 21, 0.24)',
              }
            : {}),
        };
      }

      return {
        kind: GridCellKind.Text,
        data: val,
        displayData: val,
        allowOverlay: !colMeta?.readonly,
        allowWrapping: colMeta?.wrap ?? false,
        contentAlign: colMeta?.align,
        themeOverride,
      };
    },
    [visibleColIndices, viewRowIndices, csvData, meta, styleCtx, matchSet, activeMatch, themeMode],
  );

  // Cell edit handler
  const onCellEdited = useCallback(
    ([visibleCol, viewRow]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) return;
      const actualCol = visibleColIndices[visibleCol];
      const dataRow = viewRowIndices[viewRow];
      if (actualCol === undefined || dataRow === undefined) return;

      const row = rowsRef.current[dataRow];
      if (!row) return;
      const before = row[actualCol] ?? '';
      const after = newValue.data;
      if (before === after) return;

      row[actualCol] = after;
      historyRef.current.push({
        type: 'editCells',
        changes: [{ dataRow, col: actualCol, before, after }],
      });
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
    },
    [visibleColIndices, viewRowIndices],
  );

  // Column resize -> persist to .meta.jsonc
  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      if (!column.id) return;
      const clamped = Math.max(40, Math.min(1600, Math.round(newSize)));
      patchMeta(['columns', column.id, 'width'], clamped);
    },
    [patchMeta],
  );

  // Header click -> cycle view sort (asc -> desc -> none) & persist to .meta.jsonc
  const onHeaderClicked = useCallback(
    (colIndex: number) => {
      const col = columns[colIndex];
      if (!col?.id) return;
      const current = meta.view?.sort?.[0];
      let nextSort: SortSpec[] | undefined;
      if (!current || current.column !== col.id) {
        nextSort = [{ column: col.id, direction: 'asc' }];
      } else if (current.direction === 'asc') {
        nextSort = [{ column: col.id, direction: 'desc' }];
      } else {
        nextSort = undefined;
      }
      patchMeta(['view', 'sort'], nextSort);
    },
    [columns, meta.view?.sort, patchMeta],
  );

  const handleSaveCsv = useCallback(async () => {
    if (!csvData) return;
    const bytes = serializeCsv(csvData.headers, rowsRef.current, csvData.dialect);
    await adapter.saveCsv(bytes);
    setDirtyCsv(false);
    setStatusMsg(
      `Saved ${fileName} (${rowsRef.current.length.toLocaleString()} rows)`,
    );
  }, [adapter, csvData, fileName]);

  const handleUndo = useCallback(() => {
    const cmd = historyRef.current.undo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    const cmd = historyRef.current.redo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
    }
  }, []);

  const handleAddRow = useCallback(() => {
    if (!csvData) return;
    const colCount = csvData.headers.length;
    const newRow = Array.from({ length: colCount }, () => '');
    let insertIdx = rowsRef.current.length;
    if (selection.current) {
      const dataRow = viewRowIndices[selection.current.cell[1]];
      if (dataRow !== undefined) insertIdx = dataRow + 1;
    }
    rowsRef.current.splice(insertIdx, 0, newRow);
    historyRef.current.push({ type: 'insertRow', index: insertIdx, row: [...newRow] });
    setDirtyCsv(true);
    setDataVersion((v) => v + 1);
  }, [csvData, selection, viewRowIndices]);

  const handleDeleteRow = useCallback(() => {
    if (!csvData || !selection.current) return;
    const dataRow = viewRowIndices[selection.current.cell[1]];
    if (dataRow === undefined) return;
    const removed = rowsRef.current.splice(dataRow, 1)[0];
    if (!removed) return;
    historyRef.current.push({ type: 'deleteRow', index: dataRow, row: [...removed] });
    setDirtyCsv(true);
    setDataVersion((v) => v + 1);
  }, [csvData, selection, viewRowIndices]);

  // Keyboard shortcuts (Ctrl/Cmd + S, Z, Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void handleSaveCsv();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveCsv, handleUndo, handleRedo]);

  // Apply style to selected single cell (cells) OR multi-cell drag selection (ranges)
  const applyStyleToSelection = useCallback(
    (updater: (current: CellStyle) => CellStyle) => {
      if (!selection.current || !csvData) return;
      const { range, cell } = selection.current;
      const isMulti = range.width > 1 || range.height > 1;

      if (!isMulti) {
        const [visCol, viewRow] = cell;
        const actualCol = visibleColIndices[visCol];
        const dataRow = viewRowIndices[viewRow];
        if (actualCol === undefined || dataRow === undefined) return;
        const colKey = csvData.columnKeys[actualCol] ?? String(actualCol);
        const cellKey = `${dataRow}:${colKey}`;
        const existingRef = meta.cells?.[cellKey];
        const existing: CellStyle =
          typeof existingRef === 'string'
            ? { ...(meta.styles?.[existingRef] ?? {}) }
            : { ...(existingRef ?? {}) };
        const next = updater(existing);
        patchMeta(['cells', cellKey], next);
        return;
      }

      // Multi-cell selection -> persist compactly to meta.ranges when unsorted,
      // or per-cell fallback if view is currently sorted.
      const startCol = visibleColIndices[range.x];
      const endCol = visibleColIndices[range.x + range.width - 1];
      const startDataRow = viewRowIndices[range.y];
      const endDataRow = viewRowIndices[range.y + range.height - 1];
      if (
        startCol === undefined ||
        endCol === undefined ||
        startDataRow === undefined ||
        endDataRow === undefined
      ) {
        return;
      }

      const isSorted = (meta.view?.sort?.length ?? 0) > 0;
      if (!isSorted) {
        const ref = `${Math.min(startDataRow, endDataRow)}:${Math.min(startCol, endCol)}..${Math.max(startDataRow, endDataRow)}:${Math.max(startCol, endCol)}`;
        const existingRanges: RangeStyleRule[] = meta.ranges ? [...meta.ranges] : [];
        const matchIdx = existingRanges.findIndex((r) => r.ref === ref);
        const prevStyle: CellStyle =
          matchIdx >= 0 && typeof existingRanges[matchIdx]!.style !== 'string'
            ? { ...(existingRanges[matchIdx]!.style as CellStyle) }
            : {};
        const nextStyle = updater(prevStyle);
        if (matchIdx >= 0) {
          existingRanges[matchIdx] = { ref, style: nextStyle };
        } else {
          existingRanges.push({ ref, style: nextStyle });
        }
        patchMeta(['ranges'], existingRanges);
      } else {
        // Fallback when sorted: write individual cells up to a safe cap
        const nextCells = { ...(meta.cells ?? {}) };
        const maxCells = 200;
        let count = 0;
        for (let r = range.y; r < range.y + range.height && count < maxCells; r++) {
          const dataRow = viewRowIndices[r];
          if (dataRow === undefined) continue;
          for (let c = range.x; c < range.x + range.width && count < maxCells; c++) {
            const actualCol = visibleColIndices[c];
            if (actualCol === undefined) continue;
            const colKey = csvData.columnKeys[actualCol] ?? String(actualCol);
            const key = `${dataRow}:${colKey}`;
            const cur = nextCells[key];
            const base: CellStyle =
              typeof cur === 'string' ? { ...(meta.styles?.[cur] ?? {}) } : { ...(cur ?? {}) };
            nextCells[key] = updater(base);
            count++;
          }
        }
        patchMeta(['cells'], nextCells);
      }
    },
    [selection, csvData, visibleColIndices, viewRowIndices, meta, patchMeta],
  );

  const selectedDataRow = selection.current
    ? viewRowIndices[selection.current.cell[1]]
    : undefined;
  const selectedRowHeight =
    selectedDataRow !== undefined
      ? (meta.rows?.[String(selectedDataRow)]?.height ??
          meta.table?.defaultRowHeight ??
          DEFAULT_ROW_HEIGHT)
      : (meta.table?.defaultRowHeight ?? DEFAULT_ROW_HEIGHT);

  const rowHeight = useCallback(
    (viewRow: number) => {
      const dataRow = viewRowIndices[viewRow];
      const fallback = meta.table?.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;
      if (dataRow === undefined) return fallback;
      return meta.rows?.[String(dataRow)]?.height ?? fallback;
    },
    [viewRowIndices, meta.rows, meta.table?.defaultRowHeight],
  );

  const isDark = themeMode === 'dark';
  const toolbarBg = isDark ? '#252526' : '#f8fafc';
  const toolbarBorder = isDark ? '#3c3c3c' : '#e2e8f0';
  const toolbarFg = isDark ? '#e2e8f0' : '#0f172a';
  const btnStyle: React.CSSProperties = {
    padding: '4px 9px',
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${toolbarBorder}`,
    background: isDark ? '#333333' : '#ffffff',
    color: toolbarFg,
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: toolbarBg,
          borderBottom: `1px solid ${toolbarBorder}`,
          color: toolbarFg,
          fontSize: 12,
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        <strong style={{ marginRight: 4 }}>
          {fileName || 'MetaCSV'}
          {dirtyCsv ? ' ●' : ''}
        </strong>

        <button style={btnStyle} onClick={() => void handleSaveCsv()} disabled={!dirtyCsv}>
          Save CSV
        </button>
        <button style={btnStyle} onClick={handleUndo} disabled={!historyRef.current.canUndo()}>
          Undo
        </button>
        <button style={btnStyle} onClick={handleRedo} disabled={!historyRef.current.canRedo()}>
          Redo
        </button>
        <button style={btnStyle} onClick={handleAddRow} title="Insert empty row below selection">
          + Row
        </button>
        <button
          style={btnStyle}
          onClick={handleDeleteRow}
          disabled={!selection.current}
          title="Delete selected row"
        >
          - Row
        </button>

        <span style={{ opacity: 0.4 }}>|</span>

        {/* Style controls for active cell or dragged range */}
        <button
          style={{ ...btnStyle, fontWeight: 700 }}
          title="Toggle Bold on selection"
          onClick={() => applyStyleToSelection((s) => ({ ...s, bold: !s.bold }))}
        >
          B
        </button>
        <button
          style={{ ...btnStyle, fontStyle: 'italic' }}
          title="Toggle Italic on selection"
          onClick={() => applyStyleToSelection((s) => ({ ...s, italic: !s.italic }))}
        >
          I
        </button>
        {SWATCH_COLORS.map((sw) => (
          <button
            key={sw.label}
            title={`Background: ${sw.label}`}
            style={{
              ...btnStyle,
              padding: '2px 6px',
              background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
            }}
            onClick={() =>
              applyStyleToSelection((s) => ({ ...s, backgroundColor: sw.value }))
            }
          >
            {sw.label === 'Clear' ? '×' : ' '}
          </button>
        ))}

        <span style={{ opacity: 0.4 }}>|</span>

        {/* View / Layout menu */}
        <button
          style={{
            ...btnStyle,
            borderColor: showViewMenu ? '#3b82f6' : toolbarBorder,
          }}
          onClick={() => setShowViewMenu((s) => !s)}
        >
          View / Columns ▾
        </button>

        {/* Search box */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${toolbarBorder}`,
            background: isDark ? '#1e1e1e' : '#ffffff',
            color: toolbarFg,
            width: 150,
          }}
        />
        {searchQuery.trim() && (
          <>
            <span>
              {matches.length > 0 ? `${activeMatchIdx + 1}/${matches.length}` : '0'}
            </span>
            <button
              style={btnStyle}
              disabled={matches.length === 0}
              onClick={() =>
                setActiveMatchIdx((i) => (i - 1 + matches.length) % matches.length)
              }
            >
              ↑
            </button>
            <button
              style={btnStyle}
              disabled={matches.length === 0}
              onClick={() => setActiveMatchIdx((i) => (i + 1) % matches.length)}
            >
              ↓
            </button>
          </>
        )}

        <div style={{ marginLeft: 'auto', opacity: 0.75 }}>{statusMsg}</div>

        {/* View / Columns Popover */}
        {showViewMenu && csvData && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 10,
              zIndex: 40,
              width: 310,
              maxHeight: 420,
              overflowY: 'auto',
              padding: 12,
              borderRadius: 6,
              background: isDark ? '#1f1f23' : '#ffffff',
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12 }}>Table Layout (.meta.jsonc)</div>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>First Row is Header</span>
              <input
                type="checkbox"
                checked={meta.csv?.hasHeader ?? true}
                onChange={(e) => patchMeta(['csv', 'hasHeader'], e.target.checked)}
              />
            </label>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Freeze Columns</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, visibleColIndices.length - 1)}
                value={meta.table?.freezeColumns ?? 0}
                onChange={(e) =>
                  patchMeta(['table', 'freezeColumns'], Math.max(0, Number(e.target.value) || 0))
                }
                style={{ width: 64 }}
              />
            </label>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Font Size (px)</span>
              <input
                type="number"
                min={9}
                max={32}
                value={meta.table?.fontSize ?? DEFAULT_FONT_SIZE}
                onChange={(e) =>
                  patchMeta(
                    ['table', 'fontSize'],
                    Math.max(9, Math.min(32, Number(e.target.value) || DEFAULT_FONT_SIZE)),
                  )
                }
                style={{ width: 64 }}
              />
            </label>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Default Row Height (px)</span>
              <input
                type="number"
                min={20}
                max={200}
                value={meta.table?.defaultRowHeight ?? DEFAULT_ROW_HEIGHT}
                onChange={(e) =>
                  patchMeta(
                    ['table', 'defaultRowHeight'],
                    Math.max(20, Math.min(200, Number(e.target.value) || DEFAULT_ROW_HEIGHT)),
                  )
                }
                style={{ width: 64 }}
              />
            </label>

            {selectedDataRow !== undefined && (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Selected Row #{selectedDataRow + 1} Height</span>
                <input
                  type="number"
                  min={20}
                  max={400}
                  value={selectedRowHeight}
                  onChange={(e) =>
                    patchMeta(
                      ['rows', String(selectedDataRow), 'height'],
                      Math.max(20, Math.min(400, Number(e.target.value) || DEFAULT_ROW_HEIGHT)),
                    )
                  }
                  style={{ width: 64 }}
                />
              </label>
            )}

            <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '2px 0' }} />
            <div style={{ fontWeight: 700, fontSize: 12 }}>Visible Columns</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {csvData.columnKeys.map((key, idx) => {
                const colMeta = meta.columns?.[key];
                const isVisible = colMeta?.visible !== false;
                const label = colMeta?.label ?? csvData.headers[idx] ?? `column ${idx + 1}`;
                return (
                  <label
                    key={key}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => {
                        // Keep at least one column visible
                        if (!e.target.checked && visibleColIndices.length <= 1) return;
                        patchMeta(['columns', key, 'visible'], e.target.checked);
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Grid container */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {showProgressOverlay && loadingProgress && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: isDark ? 'rgba(24, 24, 27, 0.82)' : 'rgba(248, 250, 252, 0.85)',
              backdropFilter: 'blur(2px)',
              color: toolbarFg,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {loadingProgress.phase === 'decoding'
                ? 'Reading CSV file...'
                : loadingProgress.phase === 'parsing'
                  ? `Parsing CSV... (${loadingProgress.rowsParsed.toLocaleString()} rows)`
                  : 'Finalizing grid...'}
            </div>
            <div
              style={{
                width: 280,
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                background: isDark ? '#333338' : '#cbd5e1',
              }}
            >
              <div
                style={{
                  width: `${Math.max(4, loadingProgress.percent)}%`,
                  height: '100%',
                  background: '#3b82f6',
                  transition: 'width 80ms linear',
                }}
              />
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{loadingProgress.percent}%</div>
          </div>
        )}

        {csvData && (
          <DataEditor
            ref={gridRef}
            width="100%"
            height="100%"
            columns={columns}
            rows={viewRowIndices.length}
            getCellContent={getCellContent}
            onCellEdited={onCellEdited}
            onColumnResize={onColumnResize}
            onHeaderClicked={onHeaderClicked}
            gridSelection={selection}
            onGridSelectionChange={setSelection}
            rowHeight={rowHeight}
            headerHeight={meta.table?.headerHeight ?? DEFAULT_HEADER_HEIGHT}
            freezeColumns={meta.table?.freezeColumns ?? 0}
            rowMarkers="number"
            smoothScrollX
            smoothScrollY
            theme={gridTheme}
            getCellsForSelection={true}
            keybindings={{ search: false }}
          />
        )}
      </div>
    </div>
  );
};
