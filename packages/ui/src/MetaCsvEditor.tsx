import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bold,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Info,
  Italic,
  Menu,
  Minus,
  Palette,
  Plus,
  Redo2,
  Save,
  Search,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type DrawCellCallback,
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
  type FilterPreset,
  type MarkerColor,
  type MetaCsvDocument,
  type RangeStyleRule,
  type RowMarker,
  type SortSpec,
} from '@meta-csv/schema';
import {
  UndoRedoHistory,
  applyViewFilter,
  buildSortedRowIndices,
  createStyleResolverContext,
  doesCellMatchFilterTerms,
  indexToExcelColumn,
  parseMetaJsonc,
  patchMetaJsonc,
  resolveCellStyle,
  searchVisibleRows,
  serializeCsv,
  type FileSystemAdapter,
  type ParseProgress,
  type ParsedCsvData,
  type ParsedFilterTerm,
  type SearchMatch,
} from '@meta-csv/core';
import { buildGridTheme, type ThemePreference } from './theme';
import { parseCsvInWorker } from './parseInWorker';
import { FilterBar, type FilterColumnOption } from './FilterBar';
import { MARKER_COLORS, MARKER_PALETTE, MarkerControls } from './MarkerControls';
import {
  AboutModal,
  SettingsModal,
  type EditorAppSettings,
  type EditorHostMode,
  type FileLayoutSettingsProps,
} from './SettingsAboutDialogs';
import { useInputHistory } from './useInputHistory';

export interface MetaCsvEditorHandle {
  saveCsv: () => Promise<void>;
  serializeCurrentCsv: () => Uint8Array | null;
  undo: () => void;
  redo: () => void;
  reload: () => void;
  markClean: () => void;
}

export interface EditorStatusInfo {
  fileName: string;
  dirty: boolean;
  totalRows: number;
  visibleRows: number;
  cols: number;
  markerCount: number;
  encoding?: string;
  lineEnding?: string;
}

export interface MetaCsvEditorProps {
  adapter: FileSystemAdapter;
  hostMode?: EditorHostMode;
  themeMode?: 'light' | 'dark';
  themePreference?: ThemePreference;
  systemTheme?: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings?: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  onOpenSettings?: () => void;
  onOpenFile?: () => void;
  fileMenuItems?: React.ReactNode;
  settingsExtraSection?: React.ReactNode;
  onDocumentEdit?: (label: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (info: EditorStatusInfo) => void;
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

export const MetaCsvEditor = React.forwardRef<MetaCsvEditorHandle, MetaCsvEditorProps>(
  function MetaCsvEditor(
    {
      adapter,
      hostMode = 'web',
      themeMode = 'dark',
      themePreference,
      systemTheme,
      onThemePreferenceChange,
      appSettings,
      onAppSettingsChange,
      onOpenSettings,
      onOpenFile,
      fileMenuItems,
      settingsExtraSection,
      onDocumentEdit,
      onDirtyChange,
      onStatusChange,
      externalMetaText,
      onMetaTextChange,
    },
    ref,
  ) {
  const [fileName, setFileName] = useState<string>('');
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null);
  const [meta, setMeta] = useState<MetaCsvDocument>({ version: '0.1' });
  const [autoWidths, setAutoWidths] = useState<number[]>([]);
  const [dirtyCsv, setDirtyCsv] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [dataVersion, setDataVersion] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<'none' | 'file' | 'edit'>('none');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<ParseProgress | null>(null);
  const [showProgressOverlay, setShowProgressOverlay] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Ensure Glide Data Grid overlay editor portal exists in any host DOM
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('portal')) {
      const portal = document.createElement('div');
      portal.id = 'portal';
      portal.style.position = 'fixed';
      portal.style.left = '0';
      portal.style.top = '0';
      portal.style.zIndex = '9999';
      document.body.appendChild(portal);
    }
  }, []);

  useEffect(() => {
    if (openMenu === 'none') return;
    const onDocDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenMenu('none');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [openMenu]);

  useEffect(() => {
    onDirtyChange?.(dirtyCsv);
  }, [dirtyCsv, onDirtyChange]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const searchHistory = useInputHistory('metacsv.searchHistory');
  const filteredSearchHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchHistory.items;
    return searchHistory.items.filter(
      (item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q,
    );
  }, [searchHistory.items, searchQuery]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    const t = window.setTimeout(() => {
      searchHistory.push(trimmed);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [searchQuery, searchHistory.push]);

  // Filter state (Google-like query + grep -C context + consecutive dedupe)
  const [filterQuery, setFilterQuery] = useState('');
  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState('');
  const [filterContextRows, setFilterContextRows] = useState(0);
  const [collapseColKey, setCollapseColKey] = useState('');
  const [activeMarkerColor, setActiveMarkerColor] = useState<MarkerColor>(
    appSettings?.defaultMarkerColor ?? 'amber',
  );
  const [onlyMarked, setOnlyMarked] = useState(false);

  useEffect(() => {
    if (appSettings?.defaultMarkerColor) {
      setActiveMarkerColor(appSettings.defaultMarkerColor);
    }
  }, [appSettings?.defaultMarkerColor]);

  // Selection state
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  const gridRef = useRef<DataEditorRef | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<string[][]>([]);
  const historyRef = useRef(new UndoRedoHistory());
  const metaSaveTimerRef = useRef<number | null>(null);
  const metaTextRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const prevAdapterRef = useRef<FileSystemAdapter | null>(null);

  // Load from adapter & parse in Web Worker (releasing raw CSV bytes right after parse)
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    isLoadingRef.current = true;

    if (prevAdapterRef.current !== adapter) {
      prevAdapterRef.current = adapter;
      rowsRef.current = [];
      setCsvData(null);
      setOnlyMarked(false);
    }

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
        const normalizedMetaText = payload.metaText ?? '';
        setFileName(payload.fileName);
        setMeta(parsedMeta);
        metaTextRef.current = normalizedMetaText;
        onMetaTextChange?.(normalizedMetaText);
        setFilterQuery(parsedMeta.view?.activeFilter ?? '');
        setDebouncedFilterQuery(parsedMeta.view?.activeFilter ?? '');
        setFilterContextRows(parsedMeta.view?.filterContextRows ?? 0);

        const { parsed, autoWidths: widths, elapsedMs } = await parseCsvInWorker(
          payload.csvBytes,
          parsedMeta.csv,
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
          `[MetaCSV] Loaded ${payload.fileName}: ${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} cols in ${elapsedMs} ms`,
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

  const applyParsedMetaAndReparseIfNeeded = useCallback(
    (nextText: string | null) => {
      const nextMeta = parseMetaJsonc(nextText);
      metaTextRef.current = nextText ?? '';
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

  // Debounce filter query input (220ms) for smooth typing even on 1M rows
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedFilterQuery(filterQuery);
    }, 220);
    return () => window.clearTimeout(t);
  }, [filterQuery]);

  const getDefaultColumnTitle = useCallback(
    (idx: number): string => {
      if (!csvData) return `column ${idx + 1}`;
      if (csvData.dialect.hasHeader) {
        return csvData.headers[idx] ?? `column ${idx + 1}`;
      }
      return appSettings?.noHeaderColumnStyle === 'numbered'
        ? `column ${idx + 1}`
        : indexToExcelColumn(idx);
    },
    [csvData, appSettings?.noHeaderColumnStyle],
  );

  // Column name + alias lookup for FilterBar (supports both raw column keys and .meta.jsonc labels)
  const filterColumnOptions: FilterColumnOption[] = useMemo(() => {
    if (!csvData) return [];
    return csvData.columnKeys.map((key, idx) => ({
      index: idx,
      key,
      label: meta.columns?.[key]?.label ?? getDefaultColumnTitle(idx),
    }));
  }, [csvData, meta.columns, getDefaultColumnTitle]);

  const filterColumnLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const col of filterColumnOptions) {
      map.set(col.key, col.index);
      map.set(col.key.toLowerCase(), col.index);
      map.set(col.label, col.index);
      map.set(col.label.toLowerCase(), col.index);
    }
    return map;
  }, [filterColumnOptions]);

  // Step 1: View sort indices (non-destructive)
  const sortedRowIndices = useMemo(() => {
    if (!csvData) return new Int32Array(0);
    return buildSortedRowIndices(rowsRef.current, csvData.columnKeys, meta.view?.sort);
  }, [csvData, meta.view?.sort, dataVersion]);

  // Step 2: Apply Excel-surpassing filter (Regex / NOT / compare / grep -C / dedupe)
  const filterState = useMemo(() => {
    if (!csvData) {
      return {
        indices: new Int32Array(0),
        matchedRowSet: null as Set<number> | null,
        matchedCount: 0,
        collapsedCounts: null as Map<number, number> | null,
        positiveTerms: [] as ParsedFilterTerm[],
        error: undefined as string | undefined,
        elapsedMs: 0,
      };
    }
    const collapseIdx =
      collapseColKey !== '' ? (filterColumnLookup.get(collapseColKey) ?? null) : null;
    if (!debouncedFilterQuery.trim() && collapseIdx === null) {
      return {
        indices: sortedRowIndices,
        matchedRowSet: null,
        matchedCount: sortedRowIndices.length,
        collapsedCounts: null,
        positiveTerms: [] as ParsedFilterTerm[],
        error: undefined,
        elapsedMs: 0,
      };
    }
    const t0 = performance.now();
    const res = applyViewFilter(rowsRef.current, sortedRowIndices, {
      query: debouncedFilterQuery,
      contextRows: filterContextRows,
      collapseColIndex: collapseIdx,
      columnLookup: filterColumnLookup,
    });
    return { ...res, elapsedMs: Math.round(performance.now() - t0) };
  }, [
    csvData,
    sortedRowIndices,
    debouncedFilterQuery,
    filterContextRows,
    collapseColKey,
    filterColumnLookup,
  ]);

  // Step 3: Row Markers (Bookmark & Jump)
  const markers: RowMarker[] = useMemo(() => {
    const raw = meta.view?.markers;
    if (!raw || raw.length === 0) return [];
    return [...raw].sort((a, b) => a.row - b.row);
  }, [meta.view?.markers]);

  const markerMap = useMemo(() => {
    const map = new Map<number, RowMarker>();
    for (const m of markers) {
      map.set(m.row, m);
    }
    return map;
  }, [markers]);

  useEffect(() => {
    if (onlyMarked && markerMap.size === 0) {
      setOnlyMarked(false);
    }
  }, [onlyMarked, markerMap.size]);

  const viewRowIndices = useMemo(() => {
    if (!onlyMarked || markerMap.size === 0) return filterState.indices;
    const src = filterState.indices;
    const kept: number[] = [];
    for (let i = 0; i < src.length; i++) {
      const dr = src[i]!;
      if (markerMap.has(dr)) kept.push(dr);
    }
    return Int32Array.from(kept);
  }, [filterState.indices, onlyMarked, markerMap]);

  const { markedViewRows, visibleMarkerRowSet } = useMemo(() => {
    if (markerMap.size === 0) {
      return { markedViewRows: [] as number[], visibleMarkerRowSet: new Set<number>() };
    }
    const list: number[] = [];
    const visibleSet = new Set<number>();
    for (let vr = 0; vr < viewRowIndices.length; vr++) {
      const dr = viewRowIndices[vr]!;
      if (markerMap.has(dr)) {
        list.push(vr);
        visibleSet.add(dr);
      }
    }
    return { markedViewRows: list, visibleMarkerRowSet: visibleSet };
  }, [viewRowIndices, markerMap]);

  const selectedDataRow = selection.current
    ? viewRowIndices[selection.current.cell[1]]
    : undefined;
  const selectedMarker =
    selectedDataRow !== undefined ? markerMap.get(selectedDataRow) : undefined;

  const persistMarkers = useCallback(
    (next: RowMarker[]) => {
      const sorted = [...next].sort((a, b) => a.row - b.row);
      patchMeta(['view', 'markers'], sorted.length > 0 ? sorted : undefined);
    },
    [patchMeta],
  );

  const toggleMarkerOnSelection = useCallback(() => {
    if (!selection.current) return;
    const { range, cell } = selection.current;
    const rowSet = new Set<number>();
    const maxRows = 500;
    const startY = range.height > 1 ? range.y : cell[1];
    const endY = range.height > 1 ? range.y + range.height - 1 : cell[1];
    for (let vr = startY; vr <= endY && rowSet.size < maxRows; vr++) {
      const dr = viewRowIndices[vr];
      if (dr !== undefined) rowSet.add(dr);
    }
    if (rowSet.size === 0) return;

    const allAlreadyMarked = Array.from(rowSet).every((dr) => markerMap.has(dr));
    if (allAlreadyMarked) {
      persistMarkers(markers.filter((m) => !rowSet.has(m.row)));
    } else {
      const next = [...markers];
      for (const dr of rowSet) {
        if (!markerMap.has(dr)) {
          next.push({ row: dr, color: activeMarkerColor });
        }
      }
      persistMarkers(next);
    }
  }, [selection, viewRowIndices, markerMap, markers, activeMarkerColor, persistMarkers]);

  const handleMarkerColorChange = useCallback(
    (color: MarkerColor) => {
      setActiveMarkerColor(color);
      if (selectedDataRow !== undefined && markerMap.has(selectedDataRow)) {
        persistMarkers(
          markers.map((m) => (m.row === selectedDataRow ? { ...m, color } : m)),
        );
      }
    },
    [selectedDataRow, markerMap, markers, persistMarkers],
  );

  const handleUpdateMarkerNote = useCallback(
    (dataRow: number, note: string) => {
      const trimmed = note.trim();
      persistMarkers(
        markers.map((m) => {
          if (m.row !== dataRow) return m;
          if (!trimmed) {
            const { note: _removed, ...rest } = m;
            return rest;
          }
          return { ...m, note: trimmed };
        }),
      );
    },
    [markers, persistMarkers],
  );

  const handleCycleMarkerColor = useCallback(
    (dataRow: number) => {
      persistMarkers(
        markers.map((m) => {
          if (m.row !== dataRow) return m;
          const cur = m.color ?? 'amber';
          const nextColor =
            MARKER_COLORS[(MARKER_COLORS.indexOf(cur) + 1) % MARKER_COLORS.length]!;
          return { ...m, color: nextColor };
        }),
      );
    },
    [markers, persistMarkers],
  );

  const handleRemoveMarker = useCallback(
    (dataRow: number) => {
      persistMarkers(markers.filter((m) => m.row !== dataRow));
    },
    [markers, persistMarkers],
  );

  const handleClearAllMarkers = useCallback(() => {
    persistMarkers([]);
    setOnlyMarked(false);
  }, [persistMarkers]);

  const jumpToViewRow = useCallback((targetViewRow: number) => {
    const col = 0;
    gridRef.current?.scrollTo(col, targetViewRow, 'vertical', 0, 0, {
      vAlign: 'center',
    });
    setSelection({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: {
        cell: [col, targetViewRow],
        range: { x: col, y: targetViewRow, width: 1, height: 1 },
        rangeStack: [],
      },
    });
  }, []);

  const jumpNextMarker = useCallback(() => {
    if (markedViewRows.length === 0) return;
    const currentViewRow = selection.current?.cell[1] ?? -1;
    let lo = 0;
    let hi = markedViewRows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (markedViewRows[mid]! <= currentViewRow) lo = mid + 1;
      else hi = mid;
    }
    const target = markedViewRows[lo < markedViewRows.length ? lo : 0]!;
    jumpToViewRow(target);
  }, [markedViewRows, selection, jumpToViewRow]);

  const jumpPrevMarker = useCallback(() => {
    if (markedViewRows.length === 0) return;
    const currentViewRow = selection.current?.cell[1] ?? Number.MAX_SAFE_INTEGER;
    let lo = 0;
    let hi = markedViewRows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (markedViewRows[mid]! < currentViewRow) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo - 1 >= 0 ? lo - 1 : markedViewRows.length - 1;
    jumpToViewRow(markedViewRows[idx]!);
  }, [markedViewRows, selection, jumpToViewRow]);

  const jumpToDataRow = useCallback(
    (dataRow: number) => {
      const vr = viewRowIndices.indexOf(dataRow);
      if (vr !== -1) {
        jumpToViewRow(vr);
      } else {
        setStatusMsg(`Row #${dataRow + 1} is hidden by current filter`);
      }
    },
    [viewRowIndices, jumpToViewRow],
  );

  const getRowPreview = useCallback((dataRow: number): string => {
    const row = rowsRef.current[dataRow];
    if (!row) return '';
    const parts: string[] = [];
    for (let c = 0; c < row.length && parts.length < 3; c++) {
      const v = row[c]?.trim();
      if (v) parts.push(v);
    }
    return parts.join(' · ');
  }, []);

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
      const baseTitle = colMeta?.label ?? getDefaultColumnTitle(actualColIdx);
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
  }, [csvData, visibleColIndices, meta.columns, meta.view?.sort, autoWidths, getDefaultColumnTitle]);

  const effectiveDefaultFontSize =
    meta.table?.fontSize ?? appSettings?.defaultFontSize ?? DEFAULT_FONT_SIZE;
  const effectiveDefaultRowHeight =
    meta.table?.defaultRowHeight ?? appSettings?.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;

  const gridTheme = useMemo(
    () => buildGridTheme(themeMode, { ...meta.table, fontSize: effectiveDefaultFontSize }),
    [themeMode, meta.table, effectiveDefaultFontSize],
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

      // Highlight context-only rows subtly when grep -C context mode is active
      const isContextOnlyRow =
        filterState.matchedRowSet !== null && !filterState.matchedRowSet.has(dataRow);
      const marker = markerMap.get(dataRow);
      const isFilterHit =
        !isContextOnlyRow &&
        filterState.positiveTerms.length > 0 &&
        doesCellMatchFilterTerms(val, actualCol, filterState.positiveTerms);
      const collapsedDupes =
        collapseColKey !== '' && colKey === collapseColKey
          ? filterState.collapsedCounts?.get(dataRow)
          : undefined;
      const displayVal = collapsedDupes ? `${val} (+${collapsedDupes} dupes)` : val;

      let themeOverride: Partial<Theme> | undefined;
      if (
        resolvedStyle ||
        marker ||
        isSearchHit ||
        isFilterHit ||
        colMeta?.readonly ||
        isContextOnlyRow
      ) {
        const fontSize = resolvedStyle?.fontSize ?? meta.table?.fontSize ?? DEFAULT_FONT_SIZE;
        const fontPrefix = [
          resolvedStyle?.italic ? 'italic' : '',
          resolvedStyle?.bold ? '700' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const markerBg = marker
          ? themeMode === 'dark'
            ? MARKER_PALETTE[marker.color ?? 'amber'].rowBgDark
            : MARKER_PALETTE[marker.color ?? 'amber'].rowBgLight
          : undefined;

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
          ...(isContextOnlyRow
            ? {
                textDark: themeMode === 'dark' ? '#64748b' : '#94a3b8',
                bgCell: themeMode === 'dark' ? '#18181b' : '#f8fafc',
              }
            : {}),
          ...(markerBg && !resolvedStyle?.backgroundColor ? { bgCell: markerBg } : {}),
          ...(isFilterHit
            ? {
                bgCell: 'rgba(14, 165, 233, 0.20)',
              }
            : {}),
          ...(isSearchHit
            ? {
                bgCell: isCurrentHit
                  ? 'rgba(250, 204, 21, 0.58)'
                  : 'rgba(250, 204, 21, 0.28)',
              }
            : {}),
        };
      }

      return {
        kind: GridCellKind.Text,
        data: val,
        displayData: displayVal,
        allowOverlay: !colMeta?.readonly,
        allowWrapping: colMeta?.wrap ?? false,
        contentAlign: colMeta?.align,
        themeOverride,
      };
    },
    [
      visibleColIndices,
      viewRowIndices,
      csvData,
      meta,
      styleCtx,
      markerMap,
      matchSet,
      activeMatch,
      themeMode,
      filterState.matchedRowSet,
      filterState.collapsedCounts,
      filterState.positiveTerms,
      collapseColKey,
      dataVersion,
    ],
  );

  // Draw crisp 4px marker stripe on column 0 for bookmarked rows
  const drawCell: DrawCellCallback = useCallback(
    (args, drawContent) => {
      drawContent();
      if (args.col !== 0) return;
      const dataRow = viewRowIndices[args.row];
      if (dataRow === undefined) return;
      const marker = markerMap.get(dataRow);
      if (!marker) return;
      const pal = MARKER_PALETTE[marker.color ?? 'amber'];
      const { ctx, rect } = args;
      ctx.save();
      ctx.fillStyle = pal.bar;
      ctx.fillRect(rect.x, rect.y + 1, 4, Math.max(0, rect.height - 2));
      ctx.restore();
    },
    [viewRowIndices, markerMap],
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
      gridRef.current?.updateCells([{ cell: [visibleCol, viewRow] }]);
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.('Edit cell');
    },
    [visibleColIndices, viewRowIndices, onDocumentEdit],
  );

  // Move to and open the adjacent cell editor when finishing a cell edit via Tab / Shift+Tab
  const onFinishedEditing = useCallback(
    (_newValue: GridCell | undefined, movement: Item) => {
      const [movX] = movement;
      if (movX === 0 || !csvData || columns.length === 0) return;

      const prevCell = selection.current?.cell;
      let targetCol = prevCell ? prevCell[0] + movX : 0;
      let targetRow = prevCell ? prevCell[1] : 0;
      let wrapped = false;

      if (prevCell) {
        if (movX > 0 && prevCell[0] === columns.length - 1 && prevCell[1] + 1 < viewRowIndices.length) {
          targetCol = 0;
          targetRow = prevCell[1] + 1;
          wrapped = true;
        } else if (movX < 0 && prevCell[0] === 0 && prevCell[1] > 0) {
          targetCol = columns.length - 1;
          targetRow = prevCell[1] - 1;
          wrapped = true;
        }
      }

      targetCol = Math.max(0, Math.min(columns.length - 1, targetCol));
      targetRow = Math.max(0, Math.min(viewRowIndices.length - 1, targetRow));

      if (wrapped) {
        setSelection({
          columns: CompactSelection.empty(),
          rows: CompactSelection.empty(),
          current: {
            cell: [targetCol, targetRow],
            range: { x: targetCol, y: targetRow, width: 1, height: 1 },
            rangeStack: [],
          },
        });
        gridRef.current?.scrollTo(targetCol, targetRow, 'both');
      }

      const actualCol = visibleColIndices[targetCol];
      const colKey = actualCol !== undefined ? csvData.columnKeys[actualCol] : undefined;
      if (colKey && meta.columns?.[colKey]?.readonly) return;

      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          gridRef.current?.focus();
          const canvas = gridContainerRef.current?.querySelector<HTMLCanvasElement>(
            'canvas[data-testid="data-grid-canvas"]',
          );
          if (!canvas) return;
          canvas.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true,
              cancelable: true,
            }),
          );
        }, 0);
      });
    },
    [csvData, columns.length, selection, viewRowIndices.length, visibleColIndices, meta.columns],
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

  const serializeCurrentCsv = useCallback((): Uint8Array | null => {
    if (!csvData) return null;
    return serializeCsv(csvData.headers, rowsRef.current, csvData.dialect);
  }, [csvData]);

  const handleSaveCsv = useCallback(async () => {
    const bytes = serializeCurrentCsv();
    if (!bytes) return;
    await adapter.saveCsv(bytes);
    setDirtyCsv(false);
    setStatusMsg(
      `Saved ${fileName} (${rowsRef.current.length.toLocaleString()} rows)`,
    );
  }, [adapter, serializeCurrentCsv, fileName]);

  const applyUndoLocal = useCallback(() => {
    const cmd = historyRef.current.undo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, []);

  const applyRedoLocal = useCallback(() => {
    const cmd = historyRef.current.redo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, []);

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

  useImperativeHandle(
    ref,
    () => ({
      saveCsv: handleSaveCsv,
      serializeCurrentCsv,
      undo: () => {
        applyUndoLocal();
      },
      redo: () => {
        applyRedoLocal();
      },
      reload: () => {
        setReloadTick((t) => t + 1);
      },
      markClean: () => {
        setDirtyCsv(false);
      },
    }),
    [handleSaveCsv, serializeCurrentCsv, applyUndoLocal, applyRedoLocal],
  );

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
    if (markers.length > 0 && markers.some((m) => m.row >= insertIdx)) {
      persistMarkers(
        markers.map((m) => (m.row >= insertIdx ? { ...m, row: m.row + 1 } : m)),
      );
    }
    setDirtyCsv(true);
    setDataVersion((v) => v + 1);
    onDocumentEdit?.('Insert row');
  }, [csvData, selection, viewRowIndices, markers, persistMarkers, onDocumentEdit]);

  const handleDeleteRow = useCallback(() => {
    if (!csvData || !selection.current) return;
    const dataRow = viewRowIndices[selection.current.cell[1]];
    if (dataRow === undefined) return;
    const removed = rowsRef.current.splice(dataRow, 1)[0];
    if (!removed) return;
    historyRef.current.push({ type: 'deleteRow', index: dataRow, row: [...removed] });
    if (markers.length > 0 && markers.some((m) => m.row >= dataRow)) {
      persistMarkers(
        markers
          .filter((m) => m.row !== dataRow)
          .map((m) => (m.row > dataRow ? { ...m, row: m.row - 1 } : m)),
      );
    }
    setDirtyCsv(true);
    setDataVersion((v) => v + 1);
    onDocumentEdit?.('Delete row');
  }, [csvData, selection, viewRowIndices, markers, persistMarkers, onDocumentEdit]);

  // Keyboard shortcuts (F2 / Shift+F2 / Ctrl+M for Markers; Ctrl+S/Z/Y handled when not in VS Code)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const mod = e.ctrlKey || e.metaKey;

      if (!inTextInput && ((mod && e.key.toLowerCase() === 'm') || (mod && e.key === 'F2'))) {
        e.preventDefault();
        toggleMarkerOnSelection();
        return;
      }

      if (!inTextInput && e.key === 'F2' && !mod && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) jumpPrevMarker();
        else jumpNextMarker();
        return;
      }

      if (!mod || hostMode === 'vscode') return;
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
  }, [
    hostMode,
    handleSaveCsv,
    handleUndo,
    handleRedo,
    toggleMarkerOnSelection,
    jumpNextMarker,
    jumpPrevMarker,
  ]);

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

  const selectedRowHeight =
    selectedDataRow !== undefined
      ? (meta.rows?.[String(selectedDataRow)]?.height ?? effectiveDefaultRowHeight)
      : effectiveDefaultRowHeight;

  const rowHeight = useCallback(
    (viewRow: number) => {
      const dataRow = viewRowIndices[viewRow];
      if (dataRow === undefined) return effectiveDefaultRowHeight;
      return meta.rows?.[String(dataRow)]?.height ?? effectiveDefaultRowHeight;
    },
    [viewRowIndices, meta.rows, effectiveDefaultRowHeight],
  );

  const isDark = themeMode === 'dark';

  // Report live row/col/dirty status to host (VS Code StatusBarItem, Desktop window title, Web title)
  useEffect(() => {
    if (!onStatusChange) return;
    onStatusChange({
      fileName,
      dirty: dirtyCsv,
      totalRows: csvData ? rowsRef.current.length : 0,
      visibleRows: csvData ? viewRowIndices.length : 0,
      cols: csvData ? csvData.headers.length : 0,
      markerCount: markers.length,
      encoding: csvData?.dialect.encoding,
      lineEnding: csvData?.dialect.lineEnding,
    });
  }, [
    onStatusChange,
    fileName,
    dirtyCsv,
    csvData,
    viewRowIndices.length,
    markers.length,
    dataVersion,
  ]);
  const toolbarBg = isDark ? '#252526' : '#f8fafc';
  const toolbarBorder = isDark ? '#3c3c3c' : '#e2e8f0';
  const toolbarFg = isDark ? '#e2e8f0' : '#0f172a';
  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '3px 7px',
    height: 26,
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${toolbarBorder}`,
    background: isDark ? '#333333' : '#ffffff',
    color: toolbarFg,
    cursor: 'pointer',
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    padding: '6px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: toolbarFg,
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Row 1: Navigation, Search, Marker, Popovers, Settings & About */}
      <div
        ref={toolbarRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          background: toolbarBg,
          borderBottom: `1px solid ${toolbarBorder}`,
          color: toolbarFg,
          fontSize: 12,
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {/* Host Hamburger Menu & Quick Open (hidden in VS Code where native menus handle Open/Save/Undo/Redo) */}
        {hostMode !== 'vscode' && (
          <>
            <button
              type="button"
              aria-label="Menu"
              title="File & Edit Menu"
              style={{
                ...btnStyle,
                padding: '3px 6px',
                borderColor: openMenu === 'file' ? '#3b82f6' : toolbarBorder,
              }}
              onClick={() => setOpenMenu((m) => (m === 'file' ? 'none' : 'file'))}
            >
              <Menu size={15} />
            </button>
            {onOpenFile && (
              <button
                type="button"
                aria-label="Open CSV"
                title="Open CSV..."
                style={{ ...btnStyle, padding: '3px 6px' }}
                onClick={onOpenFile}
              >
                <FolderOpen size={14} />
              </button>
            )}
          </>
        )}

        {/* Style & Row Popover Toggle (+Row / -Row / Bold / Italic / Cell Colors) */}
        <button
          type="button"
          title="Cell styles & row actions"
          aria-label="Cell styles & row actions"
          style={{
            ...btnStyle,
            borderColor: openMenu === 'edit' ? '#3b82f6' : toolbarBorder,
          }}
          onClick={() => setOpenMenu((m) => (m === 'edit' ? 'none' : 'edit'))}
        >
          <Palette size={13} />
          <span>Style</span>
        </button>

        <span style={{ opacity: 0.35 }}>|</span>

        {/* Search box with inline clear & history dropdown */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 7,
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onFocus={() => {
              if (searchHistory.items.length > 0) setShowSearchHistory(true);
            }}
            onBlur={() => setShowSearchHistory(false)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (searchHistory.items.length > 0) setShowSearchHistory(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearchHistory(false);
              } else if (e.key === 'Enter' && searchQuery.trim()) {
                searchHistory.push(searchQuery);
                setShowSearchHistory(false);
                if (matches.length > 0) {
                  setActiveMatchIdx((i) => (i + 1) % matches.length);
                }
              }
            }}
            placeholder="Search..."
            style={{
              padding: '3px 38px 3px 24px',
              height: 26,
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${toolbarBorder}`,
              background: isDark ? '#1e1e1e' : '#ffffff',
              color: toolbarFg,
              width: 165,
              boxSizing: 'border-box',
            }}
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 19,
                border: 'none',
                background: 'transparent',
                color: toolbarFg,
                opacity: 0.6,
                cursor: 'pointer',
                display: 'inline-flex',
                padding: 2,
              }}
            >
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            title="Search history"
            onClick={() => setShowSearchHistory((s) => !s)}
            style={{
              position: 'absolute',
              right: 2,
              border: 'none',
              background: 'transparent',
              color: toolbarFg,
              opacity: searchHistory.items.length > 0 ? 0.75 : 0.35,
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 3,
            }}
          >
            <ChevronDown size={11} />
          </button>

          {showSearchHistory && (filteredSearchHistory.length > 0 || searchQuery.trim().length === 0) && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 2px)',
                left: 0,
                width: 240,
                zIndex: 55,
                maxHeight: 240,
                overflowY: 'auto',
                padding: 8,
                borderRadius: 6,
                background: isDark ? '#1f1f23' : '#ffffff',
                border: `1px solid ${toolbarBorder}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <strong style={{ fontSize: 11 }}>
                  Search History ({filteredSearchHistory.length}/{searchHistory.items.length})
                </strong>
                {searchHistory.items.length > 0 && (
                  <button
                    type="button"
                    style={{ ...btnStyle, height: 20, padding: '1px 6px', fontSize: 11 }}
                    onClick={() => searchHistory.clear()}
                  >
                    Clear History
                  </button>
                )}
              </div>
              {filteredSearchHistory.length === 0 ? (
                <div style={{ fontSize: 11, opacity: 0.65 }}>No history yet.</div>
              ) : (
                filteredSearchHistory.map((item) => (
                  <div
                    key={item}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 6px',
                      borderRadius: 4,
                      background: isDark ? '#27272a' : '#f8fafc',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        cursor: 'pointer',
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item}
                      onClick={() => {
                        setSearchQuery(item);
                        setShowSearchHistory(false);
                      }}
                    >
                      {item}
                    </span>
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => searchHistory.remove(item)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: toolbarFg,
                        opacity: 0.55,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        padding: 2,
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        {searchQuery.trim() && (
          <>
            <span style={{ fontSize: 11, opacity: 0.85 }}>
              {matches.length > 0 ? `${activeMatchIdx + 1}/${matches.length}` : '0'}
            </span>
            <button
              type="button"
              style={{ ...btnStyle, padding: '3px 4px' }}
              disabled={matches.length === 0}
              onClick={() =>
                setActiveMatchIdx((i) => (i - 1 + matches.length) % matches.length)
              }
              title="Previous match"
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              style={{ ...btnStyle, padding: '3px 4px' }}
              disabled={matches.length === 0}
              onClick={() => setActiveMatchIdx((i) => (i + 1) % matches.length)}
              title="Next match"
            >
              <ChevronDown size={13} />
            </button>
          </>
        )}

        <span style={{ opacity: 0.35 }}>|</span>

        {/* Row Markers (Bookmark & Jump) unified on Row 1 */}
        {csvData && (
          <MarkerControls
            markers={markers}
            visibleMarkerCount={markedViewRows.length}
            visibleMarkerRowSet={visibleMarkerRowSet}
            selectedDataRow={selectedDataRow}
            selectedMarker={selectedMarker}
            activeColor={activeMarkerColor}
            onActiveColorChange={handleMarkerColorChange}
            onlyMarked={onlyMarked}
            onOnlyMarkedChange={setOnlyMarked}
            onToggleSelectedMarker={toggleMarkerOnSelection}
            onJumpPrev={jumpPrevMarker}
            onJumpNext={jumpNextMarker}
            onJumpToRow={jumpToDataRow}
            onUpdateMarkerNote={handleUpdateMarkerNote}
            onCycleMarkerColor={handleCycleMarkerColor}
            onRemoveMarker={handleRemoveMarker}
            onClearAll={handleClearAllMarkers}
            getRowPreview={getRowPreview}
            themeMode={themeMode}
          />
        )}

        {/* Right section: Settings + About */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Settings"
            title="Settings (File layout & App)"
            style={{ ...btnStyle, padding: '3px 6px' }}
            onClick={() => {
              setOpenMenu('none');
              setShowSettingsModal(true);
            }}
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            aria-label="About MetaCSV"
            title="About MetaCSV"
            style={{ ...btnStyle, padding: '3px 6px' }}
            onClick={() => {
              setOpenMenu('none');
              setShowAboutModal(true);
            }}
          >
            <Info size={14} />
          </button>
        </div>

        {/* Hamburger File / Edit Menu Popover (Desktop & Web) */}
        {openMenu === 'file' && hostMode !== 'vscode' && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 2px)',
              left: 10,
              zIndex: 60,
              width: 240,
              padding: 6,
              borderRadius: 6,
              background: isDark ? '#1f1f23' : '#ffffff',
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {onOpenFile && (
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setOpenMenu('none');
                  onOpenFile();
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <FolderOpen size={14} />
                  <span>Open CSV...</span>
                </span>
              </button>
            )}
            <button
              type="button"
              style={{
                ...menuItemStyle,
                opacity: !dirtyCsv && hostMode === 'desktop' ? 0.45 : 1,
              }}
              disabled={!dirtyCsv && hostMode === 'desktop'}
              onClick={() => {
                setOpenMenu('none');
                void handleSaveCsv();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Save size={14} />
                <span>{hostMode === 'web' ? 'Save / Download CSV' : 'Save CSV'}</span>
              </span>
              <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+S</span>
            </button>
            <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '3px 0' }} />
            <button
              type="button"
              style={{
                ...menuItemStyle,
                opacity: historyRef.current.canUndo() ? 1 : 0.45,
              }}
              disabled={!historyRef.current.canUndo()}
              onClick={() => {
                setOpenMenu('none');
                handleUndo();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Undo2 size={14} />
                <span>Undo</span>
              </span>
              <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Z</span>
            </button>
            <button
              type="button"
              style={{
                ...menuItemStyle,
                opacity: historyRef.current.canRedo() ? 1 : 0.45,
              }}
              disabled={!historyRef.current.canRedo()}
              onClick={() => {
                setOpenMenu('none');
                handleRedo();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Redo2 size={14} />
                <span>Redo</span>
              </span>
              <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Y</span>
            </button>
            {fileMenuItems && (
              <>
                <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '3px 0' }} />
                <div onClick={() => setOpenMenu('none')}>{fileMenuItems}</div>
              </>
            )}
          </div>
        )}

        {/* Edit & Style Popover (Row ops + Excel-like formatting) */}
        {openMenu === 'edit' && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 2px)',
              left: hostMode === 'vscode' ? 10 : 72,
              zIndex: 60,
              width: 260,
              padding: 12,
              borderRadius: 6,
              background: isDark ? '#1f1f23' : '#ffffff',
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12 }}>Rows</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                style={{ ...btnStyle, flex: 1 }}
                onClick={handleAddRow}
                title="Insert empty row below selection"
              >
                <Plus size={13} />
                <span>Insert Row</span>
              </button>
              <button
                type="button"
                style={{ ...btnStyle, flex: 1, opacity: selection.current ? 1 : 0.45 }}
                onClick={handleDeleteRow}
                disabled={!selection.current}
                title="Delete selected row"
              >
                <Minus size={13} />
                <span>Delete Row</span>
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '2px 0' }} />
            <div style={{ fontWeight: 700, fontSize: 12 }}>Cell Style (.meta.jsonc)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ ...btnStyle, padding: '3px 8px' }}
                title="Toggle Bold on selection"
                onClick={() => applyStyleToSelection((s) => ({ ...s, bold: !s.bold }))}
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                style={{ ...btnStyle, padding: '3px 8px' }}
                title="Toggle Italic on selection"
                onClick={() => applyStyleToSelection((s) => ({ ...s, italic: !s.italic }))}
              >
                <Italic size={13} />
              </button>
              <span style={{ opacity: 0.35 }}>|</span>
              {SWATCH_COLORS.map((sw) => (
                <button
                  key={sw.label}
                  type="button"
                  title={`Background: ${sw.label}`}
                  style={{
                    ...btnStyle,
                    width: 24,
                    height: 24,
                    padding: 0,
                    background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
                  }}
                  onClick={() =>
                    applyStyleToSelection((s) => ({ ...s, backgroundColor: sw.value }))
                  }
                >
                  {sw.label === 'Clear' ? <X size={12} /> : ' '}
                </button>
              ))}
            </div>

            {selectedDataRow !== undefined && (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span>Row #{selectedDataRow + 1} Height</span>
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
          </div>
        )}
      </div>

      {/* Row 2: Dedicated Filter Bar (Regex / NOT / Numeric Compare / grep -C / Dedupe / Facets / Presets) */}
      {csvData && (
        <FilterBar
          query={filterQuery}
          onQueryChange={setFilterQuery}
          contextRows={filterContextRows}
          onContextRowsChange={setFilterContextRows}
          collapseColKey={collapseColKey}
          onCollapseColKeyChange={setCollapseColKey}
          columns={filterColumnOptions}
          rows={rowsRef.current}
          activeIndices={viewRowIndices}
          totalRows={rowsRef.current.length}
          matchedCount={filterState.matchedCount}
          filterElapsedMs={filterState.elapsedMs}
          filterError={filterState.error}
          presets={meta.view?.filterPresets ?? []}
          onSavePreset={(preset: FilterPreset) => {
            const existing = (meta.view?.filterPresets ?? []).filter(
              (p) => p.name !== preset.name,
            );
            patchMeta(['view', 'filterPresets'], [...existing, preset]);
          }}
          onDeletePreset={(name: string) => {
            const next = (meta.view?.filterPresets ?? []).filter((p) => p.name !== name);
            patchMeta(['view', 'filterPresets'], next.length > 0 ? next : undefined);
          }}
          onApplyPreset={(preset: FilterPreset) => {
            setFilterQuery(preset.query);
            setDebouncedFilterQuery(preset.query);
            setFilterContextRows(preset.contextRows ?? 0);
            setCollapseColKey(preset.collapseColumn ?? '');
          }}
          themeMode={themeMode}
        />
      )}

      {/* Grid container */}
      <div ref={gridContainerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
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
            drawCell={drawCell}
            onCellEdited={onCellEdited}
            onFinishedEditing={onFinishedEditing}
            onColumnResize={onColumnResize}
            onHeaderClicked={onHeaderClicked}
            gridSelection={selection}
            onGridSelectionChange={setSelection}
            rowHeight={rowHeight}
            headerHeight={meta.table?.headerHeight ?? DEFAULT_HEADER_HEIGHT}
            freezeColumns={meta.table?.freezeColumns ?? 0}
            rowMarkers={appSettings?.showRowNumbers === false ? 'none' : 'number'}
            trapFocus={true}
            smoothScrollX
            smoothScrollY
            theme={gridTheme}
            getCellsForSelection={true}
            keybindings={{ search: false }}
          />
        )}
      </div>

      {/* Bottom Status Bar for Desktop & Web (VS Code uses native StatusBarItem) */}
      {hostMode !== 'vscode' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            height: 24,
            padding: '0 10px',
            background: toolbarBg,
            borderTop: `1px solid ${toolbarBorder}`,
            color: toolbarFg,
            fontSize: 11.5,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{
                fontWeight: dirtyCsv ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={fileName}
            >
              {fileName || 'MetaCSV'}
              {dirtyCsv ? ' *' : ''}
            </span>
            {csvData && (
              <span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>
                {csvData.dialect.encoding.toUpperCase()} · {csvData.dialect.lineEnding.toUpperCase()}
              </span>
            )}
            {statusMsg && (
              <span style={{ opacity: 0.78, whiteSpace: 'nowrap' }}>{statusMsg}</span>
            )}
          </div>
          {csvData && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, opacity: 0.85, whiteSpace: 'nowrap' }}>
              <span>
                {viewRowIndices.length !== rowsRef.current.length
                  ? `Rows=${viewRowIndices.length.toLocaleString()} / ${rowsRef.current.length.toLocaleString()}, Cols=${csvData.headers.length}`
                  : `Rows=${rowsRef.current.length.toLocaleString()}, Cols=${csvData.headers.length}`}
              </span>
              {markers.length > 0 && <span>Markers={markers.length}</span>}
            </div>
          )}
        </div>
      )}

      {/* Settings & About Dialogs */}
      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        hostMode={hostMode}
        themeMode={themeMode}
        themePreference={themePreference}
        systemTheme={systemTheme}
        onThemePreferenceChange={onThemePreferenceChange}
        appSettings={appSettings ?? {}}
        onAppSettingsChange={onAppSettingsChange}
        onOpenHostSettings={onOpenSettings}
        fileSettings={
          csvData
            ? ({
                hasHeader: meta.csv?.hasHeader ?? true,
                onHasHeaderChange: (next) => patchMeta(['csv', 'hasHeader'], next),
                freezeColumns: meta.table?.freezeColumns ?? 0,
                maxFreezeColumns: Math.max(0, visibleColIndices.length - 1),
                onFreezeColumnsChange: (next) => patchMeta(['table', 'freezeColumns'], next),
                fontSize: effectiveDefaultFontSize,
                onFontSizeChange: (next) => patchMeta(['table', 'fontSize'], next),
                defaultRowHeight: effectiveDefaultRowHeight,
                onDefaultRowHeightChange: (next) =>
                  patchMeta(['table', 'defaultRowHeight'], next),
                columns: csvData.columnKeys.map((key, idx) => {
                  const colMeta = meta.columns?.[key];
                  return {
                    key,
                    label: colMeta?.label ?? getDefaultColumnTitle(idx),
                    visible: colMeta?.visible !== false,
                  };
                }),
                onToggleColumnVisible: (key, visible) => {
                  if (!visible && visibleColIndices.length <= 1) return;
                  patchMeta(['columns', key, 'visible'], visible);
                },
              } satisfies FileLayoutSettingsProps)
            : undefined
        }
        extraSection={settingsExtraSection}
      />
      <AboutModal
        open={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        themeMode={themeMode}
        hostMode={hostMode}
      />
    </div>
  );
  },
);
