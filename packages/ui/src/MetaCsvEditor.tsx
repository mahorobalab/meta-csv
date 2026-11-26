import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  FolderOpen,
  Info,
  Italic,
  Lock,
  Menu,
  Minus,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  WrapText,
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
  type GridMouseEventArgs,
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
  type ColumnAlign,
  type ConditionalRule,
  type FilterPreset,
  type JsonlArrayMode,
  type LogParserConfig,
  type MarkerColor,
  type MetaCsvDocument,
  type MetaTextFormat,
  type RangeStyleRule,
  type RowMarker,
  type SortSpec,
} from '@meta-csv/schema';
import {
  DATE_FORMAT_PRESETS,
  NUMBER_FORMAT_PRESETS,
  UndoRedoHistory,
  applyViewFilter,
  buildDefaultHighlightRules,
  buildSortedRowIndices,
  createStyleResolverContext,
  detectTargetFormat,
  doesCellMatchFilterTerms,
  estimateAutoRowHeight,
  formatCellValue,
  indexToExcelColumn,
  isValidNumberFormat,
  parseMetaJsonc,
  patchMetaJsonc,
  resolveCellStyle,
  searchVisibleRows,
  serializeCsv,
  serializeJsonl,
  serializeLog,
  type FileSystemAdapter,
  type ParseProgress,
  type ParsedCsvData,
  type ParsedFilterTerm,
  type SearchMatch,
} from '@meta-csv/core';
import { buildGridTheme, type ThemePreference } from './theme';
import { parseTabularInWorker } from './parseInWorker';
import { FilterBar, type FilterColumnOption } from './FilterBar';
import { MARKER_COLORS, MARKER_PALETTE, MarkerControls } from './MarkerControls';
import {
  AboutModal,
  SettingsModal,
  type EditorAppSettings,
  type EditorHostMode,
  type FileLayoutSettingsProps,
} from './SettingsAboutDialogs';
import {
  BG_SWATCH_COLORS,
  ConditionalRulesModal,
  TEXT_SWATCH_COLORS,
} from './ConditionalRulesModal';
import { useInputHistory } from './useInputHistory';
import { ZebraRowsIcon } from './icons/ZebraRowsIcon';
import {
  readClipboardForColumnPaste,
  writeColumnsToClipboard,
  type CopiedColumnMeta,
  type CopiedColumnPayload,
  type NativeClipboardBridge,
} from './columnClipboard';

export interface EditorViewSnapshot {
  scrollCol: number;
  scrollRow: number;
  selectedCell?: [number, number];
  zoomScale: number;
  filterQuery: string;
  filterContextRows: number;
  collapseColKey: string;
  onlyMarked: boolean;
  searchQuery: string;
  showCellInspector: boolean;
}

export interface MetaCsvEditorHandle {
  saveCsv: () => Promise<void>;
  serializeCurrentCsv: () => Uint8Array | null;
  undo: () => void;
  redo: () => void;
  reload: () => void;
  markClean: () => void;
  captureViewSnapshot: () => EditorViewSnapshot;
}

export interface EditorStatusInfo {
  fileName: string;
  dirty: boolean;
  totalRows: number;
  visibleRows: number;
  cols: number;
  markerCount: number;
  fileBytes?: number;
  format?: MetaTextFormat;
  readOnly?: boolean;
  encoding?: string;
  lineEnding?: string;
}

export interface MetaCsvEditorProps {
  adapter: FileSystemAdapter;
  hostMode?: EditorHostMode;
  isActive?: boolean;
  initialViewSnapshot?: EditorViewSnapshot;
  filePath?: string;
  themeMode?: 'light' | 'dark';
  themePreference?: ThemePreference;
  systemTheme?: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings?: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  onOpenSettings?: () => void;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveAs?: (bytes: Uint8Array, metaText: string) => Promise<boolean | void> | boolean | void;
  onCloseFile?: () => void;
  fileMenuItems?: React.ReactNode;
  settingsExtraSection?: React.ReactNode;
  onDocumentEdit?: (label: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (info: EditorStatusInfo) => void;
  /** Optional external JSONC text override (for live playground editing) */
  externalMetaText?: string | null;
  onMetaTextChange?: (text: string) => void;
  /** Optional native clipboard bridge (Desktop Tauri uses OS clipboard without browser permission prompts) */
  nativeClipboard?: NativeClipboardBridge;
}

const AUTO_ROW_HEIGHT_ROW_LIMIT = 20_000;

export const MetaCsvEditor = React.forwardRef<MetaCsvEditorHandle, MetaCsvEditorProps>(
  function MetaCsvEditor(
    {
      adapter,
      hostMode = 'web',
      isActive = true,
      initialViewSnapshot,
      filePath,
      themeMode = 'dark',
      themePreference,
      systemTheme,
      onThemePreferenceChange,
      appSettings,
      onAppSettingsChange,
      onOpenSettings,
      onNewFile,
      onOpenFile,
      onSaveAs,
      onCloseFile,
      fileMenuItems,
      settingsExtraSection,
      onDocumentEdit,
      onDirtyChange,
      onStatusChange,
      externalMetaText,
      onMetaTextChange,
      nativeClipboard,
    },
    ref,
  ) {
  const [fileName, setFileName] = useState<string>('');
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null);
  const [meta, setMeta] = useState<MetaCsvDocument>({ version: '0.1' });
  const [activeFormat, setActiveFormat] = useState<MetaTextFormat>('csv');
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [autoWidths, setAutoWidths] = useState<number[]>([]);
  const [dirtyCsv, setDirtyCsv] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [dataVersion, setDataVersion] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<'none' | 'file' | 'edit' | 'unlock'>('none');
  const [customNumFmt, setCustomNumFmt] = useState<string>('');
  const [headerContextMenu, setHeaderContextMenu] = useState<{
    visCols: number[];
    actualCols: number[];
    colKeys: string[];
    x: number;
    y: number;
    headerBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [editingHeaderCol, setEditingHeaderCol] = useState<{
    actualCol: number;
    colKey: string;
    value: string;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [pendingHideCol, setPendingHideCol] = useState<{
    colKeys: string[];
    label: string;
    dontShowAgain: boolean;
  } | null>(null);
  const [pendingDeleteCol, setPendingDeleteCol] = useState<{
    actualCols: number[];
    colKeys: string[];
    label: string;
  } | null>(null);
  const [localConfirmHideCol, setLocalConfirmHideCol] = useState<boolean | null>(null);
  const shouldConfirmHideColumn =
    localConfirmHideCol ?? (appSettings?.confirmHideColumn !== false);
  useEffect(() => {
    setLocalConfirmHideCol(null);
  }, [appSettings?.confirmHideColumn]);
  const copiedColumnRef = useRef<CopiedColumnPayload | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(initialViewSnapshot?.zoomScale ?? 1);
  const [showCellInspector, setShowCellInspector] = useState<boolean>(
    initialViewSnapshot?.showCellInspector ?? false,
  );
  const zebraEnabled = meta.table?.zebraStriping ?? (appSettings?.zebraStriping !== false);
  const [fileBytes, setFileBytes] = useState<number>(0);
  const [showPathTooltip, setShowPathTooltip] = useState<boolean>(false);
  const [hoverRowResize, setHoverRowResize] = useState<{
    viewRow: number;
    dataRow: number;
    bottomLocalY: number;
    topLocalY: number;
    leftLocalX: number;
    width: number;
  } | null>(null);
  const [rowResizeDrag, setRowResizeDrag] = useState<{
    dataRow: number;
    topLocalY: number;
    startClientY: number;
    startBaseHeight: number;
    currentBaseHeight: number;
    guideLocalY: number;
  } | null>(null);
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
    if (!headerContextMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderContextMenu(null);
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [headerContextMenu]);

  useEffect(() => {
    onDirtyChange?.(dirtyCsv);
  }, [dirtyCsv, onDirtyChange]);

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialViewSnapshot?.searchQuery ?? '');
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
  const [filterQuery, setFilterQuery] = useState(initialViewSnapshot?.filterQuery ?? '');
  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState(
    initialViewSnapshot?.filterQuery ?? '',
  );
  const [filterContextRows, setFilterContextRows] = useState(
    initialViewSnapshot?.filterContextRows ?? 0,
  );
  const [collapseColKey, setCollapseColKey] = useState(initialViewSnapshot?.collapseColKey ?? '');
  const [activeMarkerColor, setActiveMarkerColor] = useState<MarkerColor>(
    appSettings?.defaultMarkerColor ?? 'amber',
  );
  const [onlyMarked, setOnlyMarked] = useState(initialViewSnapshot?.onlyMarked ?? false);

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
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const visibleRegionRef = useRef<{ x: number; y: number }>({
    x: initialViewSnapshot?.scrollCol ?? 0,
    y: initialViewSnapshot?.scrollRow ?? 0,
  });
  const pendingRestoreSnapshotRef = useRef<EditorViewSnapshot | null>(initialViewSnapshot ?? null);
  const rowsRef = useRef<string[][]>([]);
  const historyRef = useRef(new UndoRedoHistory());
  const metaSaveTimerRef = useRef<number | null>(null);
  const metaTextRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const prevAdapterRef = useRef<FileSystemAdapter | null>(null);
  const logConfigKeyRef = useRef<string>('{}');

  // Load from adapter & parse in Web Worker (releasing raw CSV bytes right after parse)
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
          `[MetaCSV] Loaded ${payload.fileName} (${resolvedFormat}): ${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} cols in ${elapsedMs} ms`,
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
    [csvData, activeFormat],
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

  // Track visible column borders where one or more hidden columns sit in between
  const { hiddenBeforeVisCols, hiddenAfterVisCols } = useMemo(() => {
    const before = new Set<number>();
    const after = new Set<number>();
    if (!csvData || visibleColIndices.length === 0) {
      return { hiddenBeforeVisCols: before, hiddenAfterVisCols: after };
    }
    if (visibleColIndices[0]! > 0) {
      before.add(0);
    }
    for (let i = 1; i < visibleColIndices.length; i++) {
      if (visibleColIndices[i]! - visibleColIndices[i - 1]! > 1) {
        before.add(i);
      }
    }
    if (visibleColIndices[visibleColIndices.length - 1]! < csvData.columnKeys.length - 1) {
      after.add(visibleColIndices.length - 1);
    }
    return { hiddenBeforeVisCols: before, hiddenAfterVisCols: after };
  }, [csvData, visibleColIndices]);

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

  // Column name + alias lookup for FilterBar (supports both raw column keys and .metatext.jsonc labels)
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

  // Built-in Zero-Config highlight rules for Log / JSONL when meta.rules is not explicitly set
  const defaultHighlightRules = useMemo(() => {
    if (!csvData || meta.rules !== undefined) return [];
    return buildDefaultHighlightRules(csvData.columnKeys, {
      format: activeFormat,
      levelColumn: meta.log?.levelColumn ?? csvData.logOptions?.levelColumn,
      themeMode,
    });
  }, [csvData, meta.rules, meta.log?.levelColumn, activeFormat, themeMode]);

  // Style resolver context
  const styleCtx = useMemo(() => {
    if (!csvData) return null;
    const effectiveMeta =
      meta.rules === undefined && defaultHighlightRules.length > 0
        ? { ...meta, rules: defaultHighlightRules }
        : meta;
    return createStyleResolverContext(effectiveMeta, csvData.columnKeys);
  }, [csvData, meta, defaultHighlightRules]);

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

  const effectiveDefaultFontSize =
    meta.table?.fontSize ?? appSettings?.defaultFontSize ?? DEFAULT_FONT_SIZE;
  const effectiveDefaultRowHeight =
    meta.table?.defaultRowHeight ?? appSettings?.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;

  const scaledFontSize = Math.max(8, Math.min(40, Math.round(effectiveDefaultFontSize * zoomScale)));
  const scaledDefaultRowHeight = Math.max(18, Math.round(effectiveDefaultRowHeight * zoomScale));
  const scaledHeaderHeight = Math.max(
    22,
    Math.round((meta.table?.headerHeight ?? DEFAULT_HEADER_HEIGHT) * zoomScale),
  );

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
      const baseWidth = colMeta?.width ?? autoWidths[actualColIdx] ?? 140;
      return {
        id: key,
        title: `${baseTitle}${sortIndicator}`,
        width: Math.max(40, Math.round(baseWidth * zoomScale)),
      };
    });
  }, [
    csvData,
    visibleColIndices,
    meta.columns,
    meta.view?.sort,
    autoWidths,
    getDefaultColumnTitle,
    zoomScale,
  ]);

  const gridTheme = useMemo(
    () => buildGridTheme(themeMode, { ...meta.table, fontSize: scaledFontSize }),
    [themeMode, meta.table, scaledFontSize],
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
      const activeNumFmt = resolvedStyle?.numberFormat ?? colMeta?.numberFormat;
      const formattedVal = activeNumFmt ? formatCellValue(val, activeNumFmt) : val;
      const displayVal = collapsedDupes ? `${formattedVal} (+${collapsedDupes} dupes)` : formattedVal;

      const isZebraRow = zebraEnabled && viewRow % 2 === 1;
      let themeOverride: Partial<Theme> | undefined;
      if (
        resolvedStyle ||
        marker ||
        isSearchHit ||
        isFilterHit ||
        colMeta?.readonly ||
        isContextOnlyRow ||
        isZebraRow
      ) {
        const rawStyleFontSize = resolvedStyle?.fontSize ?? effectiveDefaultFontSize;
        const fontSize = Math.max(8, Math.min(40, Math.round(rawStyleFontSize * zoomScale)));
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
          ...(isZebraRow
            ? { bgCell: themeMode === 'dark' ? '#252529' : '#f4f6f9' }
            : {}),
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

      const isColWrap =
        colMeta?.wrap ??
        (activeFormat === 'log' || activeFormat === 'text'
          ? (meta.log?.wordWrap ?? false)
          : false);

      return {
        kind: GridCellKind.Text,
        data: val,
        displayData: displayVal,
        allowOverlay: !isReadOnly && !colMeta?.readonly,
        allowWrapping: resolvedStyle?.wrap ?? (isColWrap || val.indexOf('\n') !== -1),
        contentAlign: resolvedStyle?.align ?? colMeta?.align,
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
      isReadOnly,
      activeFormat,
      effectiveDefaultFontSize,
      zoomScale,
      zebraEnabled,
      dataVersion,
    ],
  );

  // Draw crisp 4px marker stripe on column 0 + subtle grid lines on selected rows/columns + thick hidden-column dividers
  const drawCell: DrawCellCallback = useCallback(
    (args, drawContent) => {
      drawContent();
      const { ctx, rect } = args;
      const isRowOrColSelected =
        selection.rows.hasIndex(args.row) || selection.columns.hasIndex(args.col);
      if (isRowOrColSelected) {
        ctx.save();
        ctx.fillStyle =
          themeMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.14)';
        ctx.fillRect(rect.x, rect.y + rect.height - 1, rect.width, 1);
        ctx.fillRect(rect.x + rect.width - 1, rect.y, 1, rect.height);
        ctx.restore();
      }
      // Thick vertical divider indicating hidden column(s) between visible columns
      if (hiddenBeforeVisCols.has(args.col)) {
        ctx.save();
        ctx.fillStyle = themeMode === 'dark' ? '#94a3b8' : '#64748b';
        ctx.fillRect(rect.x, rect.y, 3, rect.height);
        ctx.restore();
      }
      if (hiddenAfterVisCols.has(args.col)) {
        ctx.save();
        ctx.fillStyle = themeMode === 'dark' ? '#94a3b8' : '#64748b';
        ctx.fillRect(rect.x + rect.width - 3, rect.y, 3, rect.height);
        ctx.restore();
      }
      if (args.col !== 0) return;
      const dataRow = viewRowIndices[args.row];
      if (dataRow === undefined) return;
      const marker = markerMap.get(dataRow);
      if (!marker) return;
      const pal = MARKER_PALETTE[marker.color ?? 'amber'];
      ctx.save();
      ctx.fillStyle = pal.bar;
      ctx.fillRect(rect.x, rect.y + 1, 4, Math.max(0, rect.height - 2));
      ctx.restore();
    },
    [
      viewRowIndices,
      markerMap,
      selection.rows,
      selection.columns,
      themeMode,
      hiddenBeforeVisCols,
      hiddenAfterVisCols,
    ],
  );

  // Cell edit handler
  const onCellEdited = useCallback(
    ([visibleCol, viewRow]: Item, newValue: EditableGridCell) => {
      if (isReadOnly) return;
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
    [isReadOnly, visibleColIndices, viewRowIndices, onDocumentEdit],
  );

  // Move to and open the adjacent cell editor when finishing a cell edit via Tab / Shift+Tab
  const onFinishedEditing = useCallback(
    (_newValue: GridCell | undefined, movement: Item) => {
      if (isReadOnly) return;
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
    [isReadOnly, csvData, columns.length, selection, viewRowIndices.length, visibleColIndices, meta.columns],
  );

  // Column resize -> persist base (unzoomed) width to .metatext.jsonc
  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      if (!column.id) return;
      const baseSize = newSize / (zoomScale || 1);
      const clamped = Math.max(40, Math.min(1600, Math.round(baseSize)));
      patchMeta(['columns', column.id, 'width'], clamped);
    },
    [patchMeta, zoomScale],
  );

  // Header double-click -> cycle view sort (asc -> desc -> none) & persist to .metatext.jsonc
  const lastHeaderClickRef = useRef<{ colIndex: number; time: number } | null>(null);
  const onHeaderClicked = useCallback(
    (colIndex: number) => {
      const now = Date.now();
      const prev = lastHeaderClickRef.current;
      if (!prev || prev.colIndex !== colIndex || now - prev.time > 400) {
        lastHeaderClickRef.current = { colIndex, time: now };
        return;
      }
      lastHeaderClickRef.current = null;

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

  const isContiguousCols = useCallback((cols: number[]): boolean => {
    if (cols.length === 0) return false;
    for (let i = 1; i < cols.length; i++) {
      if (cols[i]! !== cols[i - 1]! + 1) return false;
    }
    return true;
  }, []);

  // Header right-click -> preserve contiguous multi-column selection if clicked inside it; otherwise select clicked column
  const onHeaderContextMenu = useCallback(
    (colIndex: number, event: { preventDefault: () => void; bounds: { x: number; y: number; width: number; height: number } }) => {
      event.preventDefault();
      if (!csvData) return;

      const selectedVis = selection.columns.toArray();
      const keepMulti =
        selectedVis.length > 1 &&
        isContiguousCols(selectedVis) &&
        selectedVis.includes(colIndex);

      const targetVisCols = keepMulti ? selectedVis : [colIndex];
      const targetActualCols: number[] = [];
      const targetColKeys: string[] = [];
      for (const vc of targetVisCols) {
        const ac = visibleColIndices[vc];
        if (ac === undefined) continue;
        targetActualCols.push(ac);
        targetColKeys.push(csvData.columnKeys[ac] ?? String(ac));
      }
      if (targetActualCols.length === 0) return;

      setOpenMenu('none');
      setEditingHeaderCol(null);
      if (!keepMulti) {
        setSelection({
          columns: CompactSelection.fromSingleSelection(colIndex),
          rows: CompactSelection.empty(),
        });
      }

      const menuW = 262;
      const menuH = 395;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const x = Math.max(8, Math.min(event.bounds.x, vw - menuW - 8));
      const y = Math.max(8, Math.min(event.bounds.y + event.bounds.height + 2, vh - menuH - 8));
      setHeaderContextMenu({
        visCols: targetVisCols,
        actualCols: targetActualCols,
        colKeys: targetColKeys,
        x,
        y,
        headerBounds: event.bounds,
      });
    },
    [csvData, selection.columns, isContiguousCols, visibleColIndices],
  );

  const makeUniqueColKey = useCallback(
    (base: string, existingKeys: string[]): string => {
      const set = new Set(existingKeys);
      if (!set.has(base)) return base;
      let n = 2;
      while (set.has(`${base}_${n}`)) n++;
      return `${base}_${n}`;
    },
    [],
  );

  const commitHeaderTitleEdit = useCallback(() => {
    if (!editingHeaderCol || !csvData) {
      setEditingHeaderCol(null);
      return;
    }
    const { actualCol, colKey, value } = editingHeaderCol;
    const trimmed = value.trim();
    setEditingHeaderCol(null);

    if (csvData.dialect.hasHeader && !isReadOnly && activeFormat === 'csv') {
      if (!trimmed || trimmed === csvData.headers[actualCol]) return;
      const nextHeaders = [...csvData.headers];
      const nextKeys = [...csvData.columnKeys];
      const otherKeys = nextKeys.filter((_, i) => i !== actualCol);
      const uniqueKey = makeUniqueColKey(trimmed, otherKeys);
      nextHeaders[actualCol] = trimmed;
      nextKeys[actualCol] = uniqueKey;

      // Migrate column metadata from oldKey to uniqueKey if present
      if (colKey !== uniqueKey && meta.columns?.[colKey]) {
        let text = metaTextRef.current ?? '';
        text = patchMetaJsonc(text, ['columns', uniqueKey], meta.columns[colKey]);
        text = patchMetaJsonc(text, ['columns', colKey], undefined);
        scheduleMetaSave(text);
      }

      setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.('Rename column');
      setStatusMsg(`Renamed column to "${trimmed}"`);
    } else {
      // Read-Only / No-Header / JSONL / LOG -> persist display alias to .metatext.jsonc
      patchMeta(['columns', colKey, 'label'], trimmed.length > 0 ? trimmed : undefined);
      setStatusMsg(trimmed ? `Updated column label to "${trimmed}"` : 'Reset column label');
    }
  }, [
    editingHeaderCol,
    csvData,
    isReadOnly,
    activeFormat,
    makeUniqueColKey,
    meta.columns,
    scheduleMetaSave,
    onDocumentEdit,
    patchMeta,
  ]);

  const handleCopyColumns = useCallback(
    async (actualCols: number[], colKeys: string[]) => {
      if (!csvData || actualCols.length === 0) return;
      const colMetas: CopiedColumnMeta[] = actualCols.map((ac, i) => {
        const key = colKeys[i]!;
        const title = meta.columns?.[key]?.label ?? getDefaultColumnTitle(ac);
        const colCfg = meta.columns?.[key];
        const resolvedColStyle =
          typeof colCfg?.style === 'string' ? meta.styles?.[colCfg.style] : colCfg?.style;
        return {
          title,
          style: resolvedColStyle,
          align: colCfg?.align,
          wrap: colCfg?.wrap,
          numberFormat: colCfg?.numberFormat,
        };
      });

      const matrix: string[][] = new Array(viewRowIndices.length);
      for (let r = 0; r < viewRowIndices.length; r++) {
        const dr = viewRowIndices[r]!;
        const row = rowsRef.current[dr];
        matrix[r] = actualCols.map((ac) => row?.[ac] ?? '');
      }

      const payload = await writeColumnsToClipboard(
        { columns: colMetas, matrix },
        nativeClipboard,
      );
      copiedColumnRef.current = payload;
      const label =
        colMetas.length === 1 ? `"${colMetas[0]!.title}"` : `${colMetas.length} columns`;
      setStatusMsg(`Copied ${label} (${matrix.length.toLocaleString()} rows)`);
    },
    [csvData, meta.columns, meta.styles, getDefaultColumnTitle, viewRowIndices, nativeClipboard],
  );

  const handlePasteColumns = useCallback(
    async (startActualCol: number, withStyle: boolean) => {
      if (!csvData || isReadOnly) return;
      const parsed = await readClipboardForColumnPaste(
        withStyle,
        copiedColumnRef.current,
        nativeClipboard,
      );
      if (!parsed || parsed.matrix.length === 0) {
        setStatusMsg('Clipboard is empty');
        return;
      }

      const startColKey = csvData.columnKeys[startActualCol] ?? String(startActualCol);
      const colHeaderName = meta.columns?.[startColKey]?.label ?? csvData.headers[startActualCol];
      const hasExternalHeaderRow =
        parsed.source !== 'internal' &&
        csvData.dialect.hasHeader &&
        parsed.matrix.length === viewRowIndices.length + 1 &&
        Boolean(colHeaderName) &&
        (parsed.matrix[0]?.[0] === colHeaderName ||
          parsed.matrix[0]?.[0] === csvData.headers[startActualCol]);
      const dataMatrix = hasExternalHeaderRow ? parsed.matrix.slice(1) : parsed.matrix;

      const pasteColCount = Math.max(1, ...dataMatrix.map((r) => r.length));
      const nextHeaders = [...csvData.headers];
      const nextKeys = [...csvData.columnKeys];
      const nextWidths = [...autoWidths];
      let headersChanged = false;

      // Expand columns if multi-column paste extends past right edge
      while (startActualCol + pasteColCount > nextKeys.length) {
        const idx = nextKeys.length;
        const name = csvData.dialect.hasHeader
          ? makeUniqueColKey(`column_${idx + 1}`, nextKeys)
          : String(idx);
        nextHeaders.push(csvData.dialect.hasHeader ? name : '');
        nextKeys.push(name);
        nextWidths.push(140);
        headersChanged = true;
        for (let r = 0; r < rowsRef.current.length; r++) {
          rowsRef.current[r]!.push('');
        }
      }

      // If pasting into blank/placeholder columns (e.g. "column_11" or empty) with a copied column title,
      // auto-assign a unique header name (e.g. "amount_2") so it matches the copied column cleanly.
      if (csvData.dialect.hasHeader && parsed.columns) {
        for (let c = 0; c < pasteColCount; c++) {
          const targetIdx = startActualCol + c;
          const srcTitle = parsed.columns[c]?.title?.trim();
          const curHeader = (nextHeaders[targetIdx] ?? '').trim();
          if (srcTitle && (curHeader === '' || /^column_\d+$/i.test(curHeader))) {
            const otherKeys = nextKeys.filter((_, idx) => idx !== targetIdx);
            const uniqueTitle = makeUniqueColKey(srcTitle, otherKeys);
            nextHeaders[targetIdx] = uniqueTitle;
            nextKeys[targetIdx] = uniqueTitle;
            headersChanged = true;
          }
        }
      }

      // Expand rows if pasted data has more rows than currently visible
      const rowsNeeded = dataMatrix.length;
      const existingVisible = viewRowIndices.length;
      const appendedDataRows: number[] = [];
      if (rowsNeeded > existingVisible) {
        const extra = rowsNeeded - existingVisible;
        for (let i = 0; i < extra; i++) {
          const newRow = Array.from({ length: nextKeys.length }, () => '');
          rowsRef.current.push(newRow);
          appendedDataRows.push(rowsRef.current.length - 1);
        }
      }

      for (let r = 0; r < rowsNeeded; r++) {
        const dataRowIdx =
          r < existingVisible
            ? viewRowIndices[r]!
            : appendedDataRows[r - existingVisible]!;
        const targetRow = rowsRef.current[dataRowIdx];
        if (!targetRow) continue;
        const srcRow = dataMatrix[r]!;
        for (let c = 0; c < srcRow.length; c++) {
          targetRow[startActualCol + c] = srcRow[c] ?? '';
        }
      }

      if (headersChanged) {
        setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
        setAutoWidths(nextWidths);
      }

      if (withStyle && parsed.columns && parsed.columns.length > 0) {
        let text = metaTextRef.current ?? '';
        let patchedAny = false;
        for (let c = 0; c < pasteColCount; c++) {
          const colMetaSrc = parsed.columns[c];
          if (!colMetaSrc) continue;
          const targetKey = nextKeys[startActualCol + c] ?? String(startActualCol + c);
          if (colMetaSrc.style && Object.keys(colMetaSrc.style).length > 0) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'style'], colMetaSrc.style);
            patchedAny = true;
          }
          if (colMetaSrc.align) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'align'], colMetaSrc.align);
            patchedAny = true;
          }
          if (colMetaSrc.wrap) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'wrap'], true);
            patchedAny = true;
          }
          if (colMetaSrc.numberFormat) {
            text = patchMetaJsonc(
              text,
              ['columns', targetKey, 'numberFormat'],
              colMetaSrc.numberFormat,
            );
            patchedAny = true;
          }
        }
        if (patchedAny) {
          scheduleMetaSave(text);
        }
      }

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(withStyle ? 'Paste column(s) with style' : 'Paste values');
      setStatusMsg(
        `Pasted ${rowsNeeded.toLocaleString()} row${rowsNeeded === 1 ? '' : 's'}${
          pasteColCount > 1 ? ` × ${pasteColCount} cols` : ''
        }${withStyle ? ' (with style)' : ' (values only)'}`,
      );
    },
    [
      csvData,
      isReadOnly,
      autoWidths,
      viewRowIndices,
      makeUniqueColKey,
      scheduleMetaSave,
      onDocumentEdit,
      meta.columns,
      nativeClipboard,
    ],
  );

  const executeDeleteColumns = useCallback(
    (actualCols: number[], colKeys: string[], label: string) => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      if (actualCols.length >= csvData.columnKeys.length) {
        setStatusMsg('Cannot delete all remaining columns');
        return;
      }
      const removeSet = new Set(actualCols);
      const nextHeaders = csvData.headers.filter((_, i) => !removeSet.has(i));
      const nextKeys = csvData.dialect.hasHeader
        ? csvData.columnKeys.filter((_, i) => !removeSet.has(i))
        : Array.from(
            { length: csvData.columnKeys.length - removeSet.size },
            (_, i) => String(i),
          );
      const nextWidths = autoWidths.filter((_, i) => !removeSet.has(i));
      const sortedDesc = [...actualCols].sort((a, b) => b - a);
      for (let r = 0; r < rowsRef.current.length; r++) {
        const row = rowsRef.current[r]!;
        for (const colIdx of sortedDesc) {
          row.splice(colIdx, 1);
        }
      }

      if (csvData.dialect.hasHeader) {
        let text = metaTextRef.current ?? '';
        let changed = false;
        for (const k of colKeys) {
          if (meta.columns?.[k]) {
            text = patchMetaJsonc(text, ['columns', k], undefined);
            changed = true;
          }
        }
        if (changed) scheduleMetaSave(text);
      }

      setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
      setAutoWidths(nextWidths);
      setSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
      });
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(actualCols.length > 1 ? 'Delete columns' : 'Delete column');
      setStatusMsg(`Deleted ${label}`);
    },
    [csvData, isReadOnly, autoWidths, meta.columns, scheduleMetaSave, onDocumentEdit],
  );

  const handleDeleteColumns = useCallback(
    (actualCols: number[], colKeys: string[]) => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      if (actualCols.length >= csvData.columnKeys.length) {
        setStatusMsg('Cannot delete all remaining columns');
        return;
      }
      const label =
        actualCols.length === 1
          ? `列「${meta.columns?.[colKeys[0]!]?.label ?? getDefaultColumnTitle(actualCols[0]!)}」`
          : `選択中の ${actualCols.length} 列`;
      setPendingDeleteCol({ actualCols, colKeys, label });
    },
    [csvData, isReadOnly, meta.columns, getDefaultColumnTitle],
  );

  const executeHideColumns = useCallback(
    (colKeys: string[], label: string) => {
      if (visibleColIndices.length - colKeys.length < 1) {
        setStatusMsg('At least one column must remain visible');
        return;
      }
      let text = metaTextRef.current ?? '';
      for (const k of colKeys) {
        text = patchMetaJsonc(text, ['columns', k, 'visible'], false);
      }
      scheduleMetaSave(text);
      setSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
      });
      setStatusMsg(`Hidden ${label}`);
    },
    [visibleColIndices.length, scheduleMetaSave],
  );

  const handleHideColumns = useCallback(
    (actualCols: number[], colKeys: string[]) => {
      if (visibleColIndices.length - colKeys.length < 1) {
        setStatusMsg('At least one column must remain visible');
        return;
      }
      const label =
        actualCols.length === 1
          ? `列「${meta.columns?.[colKeys[0]!]?.label ?? getDefaultColumnTitle(actualCols[0]!)}」`
          : `選択中の ${actualCols.length} 列`;
      if (shouldConfirmHideColumn) {
        setPendingHideCol({ colKeys, label, dontShowAgain: false });
        return;
      }
      executeHideColumns(colKeys, label);
    },
    [
      visibleColIndices.length,
      meta.columns,
      getDefaultColumnTitle,
      shouldConfirmHideColumn,
      executeHideColumns,
    ],
  );

  const getAdjacentHiddenColumnKeys = useCallback(
    (visCols: number[]): string[] => {
      if (!csvData || visibleColIndices.length === 0 || visCols.length === 0) return [];
      const firstVis = visCols[0]!;
      const lastVis = visCols[visCols.length - 1]!;
      const keys: string[] = [];
      const firstActual = visibleColIndices[firstVis]!;
      const lastActual = visibleColIndices[lastVis]!;
      const prevActual = firstVis > 0 ? visibleColIndices[firstVis - 1]! : -1;
      for (let i = prevActual + 1; i < firstActual; i++) {
        const k = csvData.columnKeys[i];
        if (k && meta.columns?.[k]?.visible === false) keys.push(k);
      }
      const nextActual =
        lastVis < visibleColIndices.length - 1
          ? visibleColIndices[lastVis + 1]!
          : csvData.columnKeys.length;
      for (let i = lastActual + 1; i < nextActual; i++) {
        const k = csvData.columnKeys[i];
        if (k && meta.columns?.[k]?.visible === false) keys.push(k);
      }
      return keys;
    },
    [csvData, visibleColIndices, meta.columns],
  );

  const handleUnhideColumns = useCallback(
    (colKeys: string[]) => {
      if (colKeys.length === 0) return;
      let text = metaTextRef.current ?? '';
      for (const k of colKeys) {
        text = patchMetaJsonc(text, ['columns', k, 'visible'], undefined);
      }
      scheduleMetaSave(text);
      setStatusMsg(`Unhidden ${colKeys.length} column${colKeys.length === 1 ? '' : 's'}`);
    },
    [scheduleMetaSave],
  );

  const handleDuplicateColumns = useCallback(
    (actualCols: number[], colKeys: string[], side: 'left' | 'right') => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      const firstCol = actualCols[0]!;
      const lastCol = actualCols[actualCols.length - 1]!;
      const insertIdx = side === 'left' ? firstCol : lastCol + 1;

      const workingKeys = [...csvData.columnKeys];
      const dupHeaders: string[] = [];
      const dupKeys: string[] = [];
      const dupWidths: number[] = [];
      const metaCopies: Array<{ newKey: string; cfg: NonNullable<typeof meta.columns>[string] }> = [];

      for (let i = 0; i < actualCols.length; i++) {
        const ac = actualCols[i]!;
        const oldKey = colKeys[i]!;
        const baseHeader = csvData.headers[ac] ?? `column_${ac + 1}`;
        const newHeader = csvData.dialect.hasHeader
          ? makeUniqueColKey(`${baseHeader}_copy`, workingKeys)
          : '';
        if (csvData.dialect.hasHeader) {
          workingKeys.push(newHeader);
        }
        dupHeaders.push(newHeader);
        dupKeys.push(newHeader);
        dupWidths.push(autoWidths[ac] ?? 140);
        if (csvData.dialect.hasHeader && meta.columns?.[oldKey]) {
          metaCopies.push({ newKey: newHeader, cfg: { ...meta.columns[oldKey]! } });
        }
      }

      const nextHeaders = [...csvData.headers];
      nextHeaders.splice(insertIdx, 0, ...dupHeaders);

      const nextKeys = csvData.dialect.hasHeader
        ? (() => {
            const arr = [...csvData.columnKeys];
            arr.splice(insertIdx, 0, ...dupKeys);
            return arr;
          })()
        : Array.from({ length: csvData.columnKeys.length + actualCols.length }, (_, i) => String(i));

      const nextWidths = [...autoWidths];
      nextWidths.splice(insertIdx, 0, ...dupWidths);

      for (let r = 0; r < rowsRef.current.length; r++) {
        const row = rowsRef.current[r]!;
        const copiedVals = actualCols.map((ac) => row[ac] ?? '');
        row.splice(insertIdx, 0, ...copiedVals);
      }

      if (metaCopies.length > 0) {
        let text = metaTextRef.current ?? '';
        for (const item of metaCopies) {
          text = patchMetaJsonc(text, ['columns', item.newKey], item.cfg);
        }
        scheduleMetaSave(text);
      }

      setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
      setAutoWidths(nextWidths);
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(`Duplicate ${actualCols.length} column(s) ${side}`);
      setStatusMsg(
        `Duplicated ${actualCols.length} column${actualCols.length === 1 ? '' : 's'} to the ${side}`,
      );
    },
    [csvData, isReadOnly, autoWidths, makeUniqueColKey, meta.columns, scheduleMetaSave, onDocumentEdit],
  );

  const handleInsertBlankColumns = useCallback(
    (actualCols: number[], side: 'left' | 'right') => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      const count = actualCols.length;
      const firstCol = actualCols[0]!;
      const lastCol = actualCols[actualCols.length - 1]!;
      const insertIdx = side === 'left' ? firstCol : lastCol + 1;

      const workingKeys = [...csvData.columnKeys];
      const blankHeaders: string[] = [];
      const blankKeys: string[] = [];
      const blankWidths: number[] = [];
      for (let i = 0; i < count; i++) {
        const newHeader = csvData.dialect.hasHeader
          ? makeUniqueColKey(`column_${workingKeys.length + 1}`, workingKeys)
          : '';
        if (csvData.dialect.hasHeader) workingKeys.push(newHeader);
        blankHeaders.push(newHeader);
        blankKeys.push(newHeader);
        blankWidths.push(140);
      }

      const nextHeaders = [...csvData.headers];
      nextHeaders.splice(insertIdx, 0, ...blankHeaders);

      const nextKeys = csvData.dialect.hasHeader
        ? (() => {
            const arr = [...csvData.columnKeys];
            arr.splice(insertIdx, 0, ...blankKeys);
            return arr;
          })()
        : Array.from({ length: csvData.columnKeys.length + count }, (_, i) => String(i));

      const nextWidths = [...autoWidths];
      nextWidths.splice(insertIdx, 0, ...blankWidths);

      const emptyCells = Array.from({ length: count }, () => '');
      for (let r = 0; r < rowsRef.current.length; r++) {
        rowsRef.current[r]!.splice(insertIdx, 0, ...emptyCells);
      }

      setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
      setAutoWidths(nextWidths);
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(`Insert ${count} blank column(s) ${side}`);
      setStatusMsg(
        `Inserted ${count} blank column${count === 1 ? '' : 's'} to the ${side}`,
      );
    },
    [csvData, isReadOnly, autoWidths, makeUniqueColKey, onDocumentEdit],
  );

  const handleShiftColumns = useCallback(
    (visCols: number[], actualCols: number[], direction: -1 | 1) => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      const startCol = actualCols[0]!;
      const endCol = actualCols[actualCols.length - 1]!;
      const totalCols = csvData.columnKeys.length;
      if (direction === -1 && startCol <= 0) return;
      if (direction === 1 && endCol >= totalCols - 1) return;

      const rotateArr = <T,>(arr: T[]): T[] => {
        const next = [...arr];
        if (direction === -1) {
          const [moved] = next.splice(startCol - 1, 1);
          next.splice(endCol, 0, moved!);
        } else {
          const [moved] = next.splice(endCol + 1, 1);
          next.splice(startCol, 0, moved!);
        }
        return next;
      };

      const nextHeaders = rotateArr(csvData.headers);
      const nextKeys = csvData.dialect.hasHeader
        ? rotateArr(csvData.columnKeys)
        : [...csvData.columnKeys];
      const nextWidths = rotateArr(
        Array.from({ length: totalCols }, (_, i) => autoWidths[i] ?? 140),
      );

      for (let r = 0; r < rowsRef.current.length; r++) {
        const row = rowsRef.current[r]!;
        if (direction === -1) {
          const moved = row.splice(startCol - 1, 1)[0] ?? '';
          row.splice(endCol, 0, moved);
        } else {
          const moved = row.splice(endCol + 1, 1)[0] ?? '';
          row.splice(startCol, 0, moved);
        }
      }

      // When hasHeader=false, columnKeys are numeric indices so rotate meta.columns entries to follow data
      if (!csvData.dialect.hasHeader && meta.columns) {
        const oldConfigs = Array.from({ length: totalCols }, (_, i) => meta.columns?.[String(i)]);
        const rotatedConfigs = rotateArr(oldConfigs);
        let text = metaTextRef.current ?? '';
        let changed = false;
        for (let i = 0; i < totalCols; i++) {
          if (oldConfigs[i] !== rotatedConfigs[i]) {
            text = patchMetaJsonc(text, ['columns', String(i)], rotatedConfigs[i]);
            changed = true;
          }
        }
        if (changed) scheduleMetaSave(text);
      }

      setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
      setAutoWidths(nextWidths);

      // Keep the shifted column block selected so user can shift repeatedly
      const firstVis = visCols[0]!;
      const lastVis = visCols[visCols.length - 1]!;
      const nextStartVis = Math.max(0, firstVis + direction);
      const nextEndVis = Math.min(visibleColIndices.length - 1, lastVis + direction);
      setSelection({
        columns: CompactSelection.fromSingleSelection([nextStartVis, nextEndVis + 1]),
        rows: CompactSelection.empty(),
      });

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(direction < 0 ? 'Shift column(s) left' : 'Shift column(s) right');
      setStatusMsg(direction < 0 ? 'Moved column(s) left' : 'Moved column(s) right');
    },
    [
      csvData,
      isReadOnly,
      autoWidths,
      meta.columns,
      scheduleMetaSave,
      visibleColIndices.length,
      onDocumentEdit,
    ],
  );

  const serializeCurrentCsv = useCallback((): Uint8Array | null => {
    if (!csvData) return null;
    if (csvData.format === 'jsonl' && csvData.jsonlOptions) {
      return serializeJsonl(csvData.columnKeys, rowsRef.current, csvData.jsonlOptions);
    }
    if ((csvData.format === 'log' || csvData.format === 'text') && csvData.logOptions) {
      return serializeLog(csvData.columnKeys, rowsRef.current, csvData.logOptions);
    }
    return serializeCsv(csvData.headers, rowsRef.current, csvData.dialect);
  }, [csvData]);

  const handleSaveCsv = useCallback(async () => {
    if (isReadOnly) {
      setStatusMsg('Read-Only mode — unlock to save changes');
      return;
    }
    const bytes = serializeCurrentCsv();
    if (!bytes) return;
    await adapter.saveCsv(bytes);
    setDirtyCsv(false);
    setStatusMsg(
      `Saved ${fileName} (${rowsRef.current.length.toLocaleString()} rows)`,
    );
  }, [isReadOnly, adapter, serializeCurrentCsv, fileName]);

  const handleSaveAs = useCallback(async () => {
    if (!onSaveAs) return;
    const bytes = serializeCurrentCsv();
    if (!bytes) return;
    const saved = await onSaveAs(bytes, metaTextRef.current ?? '');
    if (saved !== false) {
      setDirtyCsv(false);
      setStatusMsg('Saved as new file');
    }
  }, [onSaveAs, serializeCurrentCsv]);

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
  }, [isReadOnly]);

  const applyRedoLocal = useCallback(() => {
    if (isReadOnly) return false;
    const cmd = historyRef.current.redo(rowsRef.current);
    if (cmd) {
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      return true;
    }
    return false;
  }, [isReadOnly]);

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
      captureViewSnapshot: (): EditorViewSnapshot => ({
        scrollCol: visibleRegionRef.current.x,
        scrollRow: visibleRegionRef.current.y,
        selectedCell: selection.current
          ? [selection.current.cell[0], selection.current.cell[1]]
          : undefined,
        zoomScale,
        filterQuery,
        filterContextRows,
        collapseColKey,
        onlyMarked,
        searchQuery,
        showCellInspector,
      }),
    }),
    [
      handleSaveCsv,
      serializeCurrentCsv,
      applyUndoLocal,
      applyRedoLocal,
      selection,
      zoomScale,
      filterQuery,
      filterContextRows,
      collapseColKey,
      onlyMarked,
      searchQuery,
      showCellInspector,
    ],
  );

  const applyPendingViewRestore = useCallback(() => {
    const snap = pendingRestoreSnapshotRef.current;
    if (!snap || !csvData || !gridRef.current) return;
    pendingRestoreSnapshotRef.current = null;
    const maxCol = Math.max(0, visibleColIndices.length - 1);
    const maxRow = Math.max(0, viewRowIndices.length - 1);
    const targetCol = Math.min(Math.max(0, snap.scrollCol), maxCol);
    const targetRow = Math.min(Math.max(0, snap.scrollRow), maxRow);
    visibleRegionRef.current = { x: targetCol, y: targetRow };

    const doScroll = () => {
      if (targetCol > 0 || targetRow > 0) {
        gridRef.current?.scrollTo(targetCol, targetRow, 'both', 0, 0, {
          hAlign: 'start',
          vAlign: 'start',
        });
      }
    };

    // Reinforce across animation frames + short timeout so Glide Data Grid's
    // internal ResizeObserver / InfiniteScroller has finished measuring viewport bounds.
    window.requestAnimationFrame(() => {
      doScroll();
      window.requestAnimationFrame(() => {
        doScroll();
      });
    });
    window.setTimeout(doScroll, 60);

    if (snap.selectedCell) {
      const sc = Math.min(Math.max(0, snap.selectedCell[0]), maxCol);
      const sr = Math.min(Math.max(0, snap.selectedCell[1]), maxRow);
      setSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [sc, sr],
          range: { x: sc, y: sr, width: 1, height: 1 },
          rangeStack: [],
        },
      });
    }
  }, [csvData, visibleColIndices.length, viewRowIndices.length]);

  // Fallback trigger once csvData is loaded (onVisibleRegionChanged also triggers immediately when layout is ready)
  useEffect(() => {
    if (!pendingRestoreSnapshotRef.current || !csvData) return;
    const rafId = window.requestAnimationFrame(() => {
      applyPendingViewRestore();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [csvData, applyPendingViewRestore]);

  const handleAddRow = useCallback(() => {
    if (!csvData || isReadOnly) return;
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
  }, [csvData, isReadOnly, selection, viewRowIndices, markers, persistMarkers, onDocumentEdit]);

  const handleDeleteRow = useCallback(() => {
    if (!csvData || isReadOnly || !selection.current) return;
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
  }, [csvData, isReadOnly, selection, viewRowIndices, markers, persistMarkers, onDocumentEdit]);

  // Keyboard shortcuts (F2 / Shift+F2 / Ctrl+M for Markers; Ctrl+S/Z/Y handled when not in VS Code)
  useEffect(() => {
    if (!isActive) return;
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

      if (!inTextInput && mod && e.key === '0' && zoomScale !== 1) {
        e.preventDefault();
        setZoomScale(1);
        return;
      }

      if (!mod || hostMode === 'vscode') return;
      const key = e.key.toLowerCase();
      if (key === 's' && e.shiftKey && onSaveAs) {
        e.preventDefault();
        void handleSaveAs();
      } else if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleSaveCsv();
      } else if (key === 'n' && !e.shiftKey && onNewFile) {
        e.preventDefault();
        handleNewFileAction();
      } else if (key === 'w' && !e.shiftKey && onCloseFile) {
        e.preventDefault();
        handleCloseFileAction();
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
    isActive,
    hostMode,
    handleSaveCsv,
    handleSaveAs,
    handleNewFileAction,
    handleCloseFileAction,
    onSaveAs,
    onNewFile,
    onCloseFile,
    handleUndo,
    handleRedo,
    toggleMarkerOnSelection,
    jumpNextMarker,
    jumpPrevMarker,
    zoomScale,
  ]);

  // Column selection clipboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+Shift+V) — capture phase to preempt grid default when full column(s) selected
  useEffect(() => {
    if (!isActive || !csvData || selection.columns.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (inTextInput) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;

      const selVisCols = selection.columns.toArray();
      if (selVisCols.length === 0) return;
      const targetVisCols = isContiguousCols(selVisCols) ? selVisCols : [selVisCols[0]!];
      const targetActualCols: number[] = [];
      const targetColKeys: string[] = [];
      for (const vc of targetVisCols) {
        const ac = visibleColIndices[vc];
        if (ac === undefined) continue;
        targetActualCols.push(ac);
        targetColKeys.push(csvData.columnKeys[ac] ?? String(ac));
      }
      if (targetActualCols.length === 0) return;

      if (key === 'c' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        void handleCopyColumns(targetActualCols, targetColKeys);
      } else if (key === 'v' && !e.shiftKey && !isReadOnly) {
        e.preventDefault();
        e.stopPropagation();
        void handlePasteColumns(targetActualCols[0]!, true);
      } else if (key === 'v' && e.shiftKey && !isReadOnly) {
        e.preventDefault();
        e.stopPropagation();
        void handlePasteColumns(targetActualCols[0]!, false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    isActive,
    csvData,
    selection.columns,
    isContiguousCols,
    visibleColIndices,
    isReadOnly,
    handleCopyColumns,
    handlePasteColumns,
  ]);

  // Ctrl/Cmd + Mouse Wheel zoom on the grid container (non-passive so browser zoom is prevented)
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      setZoomScale((prev) =>
        Math.round(Math.max(0.6, Math.min(2.5, prev + step)) * 10) / 10,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [csvData]);

  const selectedColumnKeys = useMemo(() => {
    if (!csvData || selection.columns.length === 0) return [] as string[];
    const keys: string[] = [];
    for (const visCol of selection.columns.toArray()) {
      const actualCol = visibleColIndices[visCol];
      if (actualCol === undefined) continue;
      const key = csvData.columnKeys[actualCol] ?? String(actualCol);
      keys.push(key);
    }
    return keys;
  }, [csvData, selection.columns, visibleColIndices]);

  const isColumnSelectionMode = selectedColumnKeys.length > 0;

  // Apply style to selected columns (when entire column(s) selected), single cell, or multi-cell range
  const applyStyleToSelection = useCallback(
    (updater: (current: CellStyle) => CellStyle, isClearAll = false) => {
      if (!csvData) return;

      if (selectedColumnKeys.length > 0) {
        let text = metaTextRef.current ?? '';
        for (const colKey of selectedColumnKeys) {
          if (isClearAll) {
            text = patchMetaJsonc(text, ['columns', colKey, 'style'], undefined);
            text = patchMetaJsonc(text, ['columns', colKey, 'align'], undefined);
            text = patchMetaJsonc(text, ['columns', colKey, 'wrap'], undefined);
            text = patchMetaJsonc(text, ['columns', colKey, 'numberFormat'], undefined);
            continue;
          }
          const colCfg = meta.columns?.[colKey];
          const existingRef = colCfg?.style;
          const existing: CellStyle = {
            ...(typeof existingRef === 'string'
              ? (meta.styles?.[existingRef] ?? {})
              : (existingRef ?? {})),
            ...(colCfg?.align ? { align: colCfg.align } : {}),
            ...(colCfg?.wrap !== undefined ? { wrap: colCfg.wrap } : {}),
            ...(colCfg?.numberFormat ? { numberFormat: colCfg.numberFormat } : {}),
          };
          const next = updater(existing);
          const { align, wrap, numberFormat, ...restStyle } = next;
          const hasStyleKeys = Object.values(restStyle).some((v) => v !== undefined);
          text = patchMetaJsonc(
            text,
            ['columns', colKey, 'style'],
            hasStyleKeys ? restStyle : undefined,
          );
          text = patchMetaJsonc(text, ['columns', colKey, 'align'], align);
          text = patchMetaJsonc(text, ['columns', colKey, 'wrap'], wrap ? true : undefined);
          text = patchMetaJsonc(
            text,
            ['columns', colKey, 'numberFormat'],
            numberFormat && numberFormat.trim().length > 0 ? numberFormat : undefined,
          );
        }
        scheduleMetaSave(text);
        return;
      }

      if (!selection.current) return;
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
        const hasAny = Object.values(next).some((v) => v !== undefined);
        patchMeta(['cells', cellKey], hasAny ? next : undefined);
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
        const hasAny = Object.values(nextStyle).some((v) => v !== undefined);
        if (matchIdx >= 0) {
          if (hasAny) {
            existingRanges[matchIdx] = { ref, style: nextStyle };
          } else {
            existingRanges.splice(matchIdx, 1);
          }
        } else if (hasAny) {
          existingRanges.push({ ref, style: nextStyle });
        }
        patchMeta(['ranges'], existingRanges.length > 0 ? existingRanges : undefined);
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
            const updated = updater(base);
            if (Object.values(updated).some((v) => v !== undefined)) {
              nextCells[key] = updated;
            } else {
              delete nextCells[key];
            }
            count++;
          }
        }
        patchMeta(['cells'], Object.keys(nextCells).length > 0 ? nextCells : undefined);
      }
    },
    [
      csvData,
      selectedColumnKeys,
      selection,
      visibleColIndices,
      viewRowIndices,
      meta,
      patchMeta,
      scheduleMetaSave,
    ],
  );

  const explicitRowHeightMap = useMemo(() => {
    const map = new Map<number, number>();
    if (meta.rows) {
      for (const [k, v] of Object.entries(meta.rows)) {
        if (v?.height !== undefined) {
          const idx = Number(k);
          if (Number.isInteger(idx) && idx >= 0) {
            map.set(idx, v.height);
          }
        }
      }
    }
    return map;
  }, [meta.rows]);

  const selectedRowHeight =
    selectedDataRow !== undefined
      ? (explicitRowHeightMap.get(selectedDataRow) ?? effectiveDefaultRowHeight)
      : effectiveDefaultRowHeight;

  const selectedActualCol =
    selection.current && csvData ? visibleColIndices[selection.current.cell[0]] : undefined;
  const selectedColKey =
    selectedActualCol !== undefined && csvData
      ? (csvData.columnKeys[selectedActualCol] ?? String(selectedActualCol))
      : undefined;
  const selectedColLabel =
    selectedColKey !== undefined && selectedActualCol !== undefined
      ? (meta.columns?.[selectedColKey]?.label ?? getDefaultColumnTitle(selectedActualCol))
      : undefined;
  const selectedColWrap =
    selectedColKey !== undefined
      ? (meta.columns?.[selectedColKey]?.wrap ??
          (activeFormat === 'log' || activeFormat === 'text'
            ? (meta.log?.wordWrap ?? false)
            : false))
      : false;
  const selectedCellStyle = useMemo(() => {
    if (!styleCtx || selectedDataRow === undefined || selectedActualCol === undefined) {
      return undefined;
    }
    return resolveCellStyle(
      styleCtx,
      selectedDataRow,
      selectedActualCol,
      rowsRef.current[selectedDataRow] ?? [],
    );
  }, [styleCtx, selectedDataRow, selectedActualCol, dataVersion]);
  const selectedCellWrap = selectedCellStyle?.wrap ?? selectedColWrap;
  const selectedCellValue =
    selectedDataRow !== undefined && selectedActualCol !== undefined
      ? (rowsRef.current[selectedDataRow]?.[selectedActualCol] ?? '')
      : '';
  const selectedCellLineCount = selectedCellValue
    ? selectedCellValue.split(/\r?\n/).length
    : 0;

  const allowFullAutoRowHeight = (csvData?.rows.length ?? 0) <= AUTO_ROW_HEIGHT_ROW_LIMIT;

  const hasMultilineRow = useMemo(() => {
    if (!csvData || !allowFullAutoRowHeight) return false;
    const rows = rowsRef.current;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      for (let c = 0; c < row.length; c++) {
        if (row[c]!.indexOf('\n') !== -1) return true;
      }
    }
    return false;
  }, [csvData, allowFullAutoRowHeight, dataVersion]);

  const { wrappedColSpecs, unwrappedVisibleColIndices } = useMemo(() => {
    if (!csvData) {
      return {
        wrappedColSpecs: [] as Array<{ colIdx: number; widthPx: number }>,
        unwrappedVisibleColIndices: [] as number[],
      };
    }
    const defaultWrap =
      activeFormat === 'log' || activeFormat === 'text'
        ? (meta.log?.wordWrap ?? false)
        : false;
    const wrapped: Array<{ colIdx: number; widthPx: number }> = [];
    const unwrapped: number[] = [];
    for (let i = 0; i < visibleColIndices.length; i++) {
      const colIdx = visibleColIndices[i]!;
      const key = csvData.columnKeys[colIdx]!;
      const colMeta = meta.columns?.[key];
      const isWrap = colMeta?.wrap ?? defaultWrap;
      if (isWrap) {
        const baseW = colMeta?.width ?? autoWidths[colIdx] ?? 140;
        wrapped.push({ colIdx, widthPx: Math.max(40, Math.round(baseW * zoomScale)) });
      } else {
        unwrapped.push(colIdx);
      }
    }
    return { wrappedColSpecs: wrapped, unwrappedVisibleColIndices: unwrapped };
  }, [csvData, visibleColIndices, meta.columns, meta.log?.wordWrap, activeFormat, autoWidths, zoomScale]);

  const needsDynamicRowHeight =
    explicitRowHeightMap.size > 0 ||
    (allowFullAutoRowHeight && (hasMultilineRow || wrappedColSpecs.length > 0));

  const dynamicRowHeight = useCallback(
    (viewRow: number) => {
      const dataRow = viewRowIndices[viewRow];
      if (dataRow === undefined) return scaledDefaultRowHeight;
      const explicit = explicitRowHeightMap.get(dataRow);
      if (explicit !== undefined) {
        return Math.max(18, Math.round(explicit * zoomScale));
      }
      if (!allowFullAutoRowHeight) {
        return scaledDefaultRowHeight;
      }
      const row = rowsRef.current[dataRow];
      if (!row) return scaledDefaultRowHeight;
      return estimateAutoRowHeight(
        row,
        wrappedColSpecs,
        hasMultilineRow ? unwrappedVisibleColIndices : [],
        {
          defaultHeight: scaledDefaultRowHeight,
          fontSize: scaledFontSize,
          maxHeight: Math.round(240 * zoomScale),
        },
      );
    },
    [
      viewRowIndices,
      explicitRowHeightMap,
      allowFullAutoRowHeight,
      scaledDefaultRowHeight,
      scaledFontSize,
      zoomScale,
      wrappedColSpecs,
      hasMultilineRow,
      unwrappedVisibleColIndices,
    ],
  );

  const rowHeightProp: number | ((row: number) => number) = needsDynamicRowHeight
    ? dynamicRowHeight
    : scaledDefaultRowHeight;

  const autoFitRows = useCallback(
    (dataRows: number[], forceWrapCols?: Set<number>, skipWrapCols?: Set<number>) => {
      if (!csvData || dataRows.length === 0) return;
      const defaultWrap =
        activeFormat === 'log' || activeFormat === 'text'
          ? (meta.log?.wordWrap ?? false)
          : false;
      let text = metaTextRef.current ?? '';
      const uniqueRows = Array.from(new Set(dataRows)).slice(0, 50);

      for (const dr of uniqueRows) {
        const row = rowsRef.current[dr];
        if (!row) continue;
        const wrappedSpecs: Array<{ colIdx: number; widthPx: number }> = [];
        const multilineCols: number[] = [];

        for (let i = 0; i < visibleColIndices.length; i++) {
          const colIdx = visibleColIndices[i]!;
          const key = csvData.columnKeys[colIdx]!;
          const colMeta = meta.columns?.[key];
          const cellStyle = styleCtx ? resolveCellStyle(styleCtx, dr, colIdx, row) : undefined;
          const isWrap = skipWrapCols?.has(colIdx)
            ? false
            : Boolean(forceWrapCols?.has(colIdx) || cellStyle?.wrap || (colMeta?.wrap ?? defaultWrap));
          if (isWrap) {
            const baseW = colMeta?.width ?? autoWidths[colIdx] ?? 140;
            wrappedSpecs.push({ colIdx, widthPx: Math.max(40, baseW) });
          } else {
            multilineCols.push(colIdx);
          }
        }

        const fitted = estimateAutoRowHeight(row, wrappedSpecs, multilineCols, {
          defaultHeight: effectiveDefaultRowHeight,
          fontSize: effectiveDefaultFontSize,
          maxHeight: 400,
        });
        const clamped = Math.max(20, Math.min(400, Math.round(fitted)));
        text = patchMetaJsonc(
          text,
          ['rows', String(dr), 'height'],
          clamped <= effectiveDefaultRowHeight ? undefined : clamped,
        );
      }

      scheduleMetaSave(text);
    },
    [
      csvData,
      activeFormat,
      meta.log?.wordWrap,
      meta.columns,
      visibleColIndices,
      styleCtx,
      autoWidths,
      effectiveDefaultRowHeight,
      effectiveDefaultFontSize,
      scheduleMetaSave,
    ],
  );

  const resetRowHeights = useCallback(
    (dataRows: number[]) => {
      if (dataRows.length === 0) return;
      let text = metaTextRef.current ?? '';
      for (const dr of Array.from(new Set(dataRows)).slice(0, 50)) {
        text = patchMetaJsonc(text, ['rows', String(dr), 'height'], undefined);
      }
      scheduleMetaSave(text);
    },
    [scheduleMetaSave],
  );

  const onGridMouseMove = useCallback(
    (args: GridMouseEventArgs) => {
      if (rowResizeDrag) return;
      const container = gridContainerRef.current;
      if (
        !container ||
        args.kind !== 'cell' ||
        args.location[0] !== -1 ||
        args.location[1] < 0
      ) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }

      const rect = container.getBoundingClientRect();
      const vr = args.location[1];
      let targetVr = -1;
      let bottomLocalY = 0;
      let topLocalY = 0;

      if (args.localEventY >= args.bounds.height - 5) {
        targetVr = vr;
        bottomLocalY = args.bounds.y + args.bounds.height - rect.top;
        topLocalY = args.bounds.y - rect.top;
      } else if (args.localEventY <= 4 && vr > 0) {
        targetVr = vr - 1;
        bottomLocalY = args.bounds.y - rect.top;
        const prevH =
          typeof rowHeightProp === 'function' ? rowHeightProp(targetVr) : rowHeightProp;
        topLocalY = bottomLocalY - prevH;
      }

      if (targetVr < 0) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }
      const dataRow = viewRowIndices[targetVr];
      if (dataRow === undefined) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }

      const leftLocalX = Math.max(0, args.bounds.x - rect.left);
      const width = Math.max(24, args.bounds.width);
      const roundedBottom = Math.round(bottomLocalY);

      setHoverRowResize((prev) => {
        if (
          prev &&
          prev.viewRow === targetVr &&
          Math.round(prev.bottomLocalY) === roundedBottom
        ) {
          return prev;
        }
        return {
          viewRow: targetVr,
          dataRow,
          bottomLocalY,
          topLocalY,
          leftLocalX,
          width,
        };
      });
    },
    [rowResizeDrag, rowHeightProp, viewRowIndices],
  );

  useEffect(() => {
    if (!rowResizeDrag) return;
    const onMove = (e: MouseEvent) => {
      const deltaBase = (e.clientY - rowResizeDrag.startClientY) / (zoomScale || 1);
      const nextBase = Math.max(20, Math.min(400, Math.round(rowResizeDrag.startBaseHeight + deltaBase)));
      const nextGuideY = rowResizeDrag.topLocalY + nextBase * zoomScale;
      setRowResizeDrag((prev) =>
        prev ? { ...prev, currentBaseHeight: nextBase, guideLocalY: nextGuideY } : null,
      );
    };
    const onUp = (e: MouseEvent) => {
      const deltaBase = (e.clientY - rowResizeDrag.startClientY) / (zoomScale || 1);
      const finalBase = Math.max(20, Math.min(400, Math.round(rowResizeDrag.startBaseHeight + deltaBase)));
      patchMeta(['rows', String(rowResizeDrag.dataRow), 'height'], finalBase);
      setRowResizeDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [rowResizeDrag?.dataRow, rowResizeDrag?.startClientY, rowResizeDrag?.startBaseHeight, rowResizeDrag?.topLocalY, zoomScale, patchMeta]);

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
      fileBytes,
      format: activeFormat,
      readOnly: isReadOnly,
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
    fileBytes,
    activeFormat,
    isReadOnly,
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
                aria-label="Open File"
                title="Open File..."
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

        {/* Right section: Read-Only Lock/Unlock + Settings + About */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {(isReadOnly || activeFormat === 'jsonl' || activeFormat === 'log') && (
            <button
              type="button"
              title={
                isReadOnly
                  ? 'Read-Only mode (click to unlock editing)'
                  : 'Editing unlocked (click to re-lock as Read-Only)'
              }
              aria-label={isReadOnly ? 'Read-Only mode' : 'Editing unlocked'}
              style={{
                ...btnStyle,
                padding: '3px 8px',
                borderColor: isReadOnly
                  ? '#f59e0b'
                  : openMenu === 'unlock'
                    ? '#3b82f6'
                    : '#10b981',
                background: isReadOnly
                  ? isDark
                    ? 'rgba(245, 158, 11, 0.16)'
                    : 'rgba(245, 158, 11, 0.14)'
                  : isDark
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(16, 185, 129, 0.12)',
                color: isReadOnly
                  ? isDark
                    ? '#fcd34d'
                    : '#b45309'
                  : isDark
                    ? '#6ee7b7'
                    : '#047857',
                fontWeight: 600,
              }}
              onClick={() => {
                if (isReadOnly) {
                  setOpenMenu((m) => (m === 'unlock' ? 'none' : 'unlock'));
                } else {
                  setOpenMenu('none');
                  setIsReadOnly(true);
                  patchMeta(['readOnly'], true);
                  setStatusMsg('Locked as Read-Only');
                }
              }}
            >
              {isReadOnly ? <Lock size={12} /> : <Unlock size={12} />}
              <span>{isReadOnly ? 'Read-Only' : 'Unlocked'}</span>
            </button>
          )}
          {zoomScale !== 1 && (
            <button
              type="button"
              title="Reset zoom to 100% (Ctrl+0 / Ctrl+Wheel)"
              onClick={() => setZoomScale(1)}
              style={{
                ...btnStyle,
                padding: '3px 7px',
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              {Math.round(zoomScale * 100)}%
            </button>
          )}
          <button
            type="button"
            aria-label="Alternating Row Colors"
            title={
              zebraEnabled
                ? 'Alternating Row Colors: ON (click to disable)'
                : 'Alternating Row Colors: OFF (click to enable)'
            }
            style={{
              ...btnStyle,
              padding: '3px 6px',
              borderColor: zebraEnabled ? '#3b82f6' : toolbarBorder,
              background: zebraEnabled
                ? isDark
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(59, 130, 246, 0.12)'
                : btnStyle.background,
            }}
            onClick={() => {
              patchMeta(['table', 'zebraStriping'], !zebraEnabled);
            }}
          >
            <ZebraRowsIcon size={14} active={zebraEnabled} />
          </button>
          <button
            type="button"
            aria-label="Cell Inspector"
            title="Toggle Cell Inspector (view full multiline text / stack trace)"
            style={{
              ...btnStyle,
              padding: '3px 6px',
              borderColor: showCellInspector ? '#3b82f6' : toolbarBorder,
              background: showCellInspector
                ? isDark
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(59, 130, 246, 0.12)'
                : btnStyle.background,
            }}
            onClick={() => setShowCellInspector((s) => !s)}
          >
            <FileText size={14} />
          </button>
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
            aria-label="About MetaText Editor"
            title="About MetaText Editor"
            style={{ ...btnStyle, padding: '3px 6px' }}
            onClick={() => {
              setOpenMenu('none');
              setShowAboutModal(true);
            }}
          >
            <Info size={14} />
          </button>

          {openMenu === 'unlock' && isReadOnly && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                zIndex: 65,
                width: 270,
                padding: 12,
                borderRadius: 6,
                background: isDark ? '#1f1f23' : '#ffffff',
                border: `1px solid ${toolbarBorder}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.34)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Lock size={13} />
                <span>Unlock Source Editing?</span>
              </div>
              <div style={{ opacity: 0.8, lineHeight: 1.45, fontSize: 11.5 }}>
                This file is currently protected as Read-Only. Sidecar metadata (filters, markers, styles) can still be saved without unlocking.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
                <button
                  type="button"
                  style={btnStyle}
                  onClick={() => setOpenMenu('none')}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{
                    ...btnStyle,
                    background: '#d97706',
                    borderColor: '#f59e0b',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setIsReadOnly(false);
                    patchMeta(['readOnly'], false);
                    setOpenMenu('none');
                    setStatusMsg('Editing unlocked (saved to .metatext.jsonc)');
                  }}
                >
                  <Unlock size={12} />
                  <span>Unlock Editing</span>
                </button>
              </div>
            </div>
          )}
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
            {onNewFile && (
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setOpenMenu('none');
                  handleNewFileAction();
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <FilePlus size={14} />
                  <span>New File</span>
                </span>
                <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+N</span>
              </button>
            )}
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
                  <span>Open File...</span>
                </span>
              </button>
            )}
            <button
              type="button"
              style={{
                ...menuItemStyle,
                opacity: isReadOnly || (!dirtyCsv && hostMode === 'desktop') ? 0.45 : 1,
              }}
              disabled={isReadOnly || (!dirtyCsv && hostMode === 'desktop')}
              onClick={() => {
                setOpenMenu('none');
                void handleSaveCsv();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Save size={14} />
                <span>
                  {activeFormat === 'jsonl'
                    ? hostMode === 'web'
                      ? 'Save / Download JSONL'
                      : 'Save JSONL'
                    : activeFormat === 'log' || activeFormat === 'text'
                      ? hostMode === 'web'
                        ? 'Save / Download Log'
                        : 'Save Log'
                      : hostMode === 'web'
                        ? 'Save / Download CSV'
                        : 'Save CSV'}
                </span>
              </span>
              <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+S</span>
            </button>
            {onSaveAs && (
              <button
                type="button"
                style={{
                  ...menuItemStyle,
                  opacity: csvData ? 1 : 0.45,
                }}
                disabled={!csvData}
                onClick={() => {
                  setOpenMenu('none');
                  void handleSaveAs();
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <SaveAll size={14} />
                  <span>Save As...</span>
                </span>
                <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+S</span>
              </button>
            )}
            {onCloseFile && (
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setOpenMenu('none');
                  handleCloseFileAction();
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <X size={14} />
                  <span>Close File</span>
                </span>
                <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+W</span>
              </button>
            )}
            <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '3px 0' }} />
            <button
              type="button"
              style={{
                ...menuItemStyle,
                opacity: !isReadOnly && historyRef.current.canUndo() ? 1 : 0.45,
              }}
              disabled={isReadOnly || !historyRef.current.canUndo()}
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
                opacity: !isReadOnly && historyRef.current.canRedo() ? 1 : 0.45,
              }}
              disabled={isReadOnly || !historyRef.current.canRedo()}
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

        {/* Style Popover (Cell Style / Columns Style, Alignment, Colors, Number Format, Conditional Rules) */}
        {openMenu === 'edit' && (() => {
          const hasStyleTarget = isColumnSelectionMode || Boolean(selection.current);
          const firstColKey = selectedColumnKeys[0];
          const firstColCfg = firstColKey ? meta.columns?.[firstColKey] : undefined;
          const activeCellColIdx = selection.current
            ? visibleColIndices[selection.current.cell[0]]
            : undefined;
          const activeCellDataRow = selection.current
            ? viewRowIndices[selection.current.cell[1]]
            : undefined;
          const activeCellResolved =
            !isColumnSelectionMode &&
            styleCtx &&
            activeCellColIdx !== undefined &&
            activeCellDataRow !== undefined &&
            rowsRef.current[activeCellDataRow]
              ? resolveCellStyle(
                  styleCtx,
                  activeCellDataRow,
                  activeCellColIdx,
                  rowsRef.current[activeCellDataRow]!,
                )
              : undefined;
          const activeCellColMeta =
            activeCellColIdx !== undefined && csvData
              ? meta.columns?.[csvData.columnKeys[activeCellColIdx] ?? String(activeCellColIdx)]
              : undefined;

          const activeWrap = isColumnSelectionMode
            ? Boolean(firstColCfg?.wrap)
            : selectedCellWrap;
          const activeAlign: ColumnAlign | undefined = isColumnSelectionMode
            ? firstColCfg?.align
            : (activeCellResolved?.align ?? activeCellColMeta?.align);
          const activeNumFmt: string = isColumnSelectionMode
            ? (firstColCfg?.numberFormat ?? '')
            : (activeCellResolved?.numberFormat ?? activeCellColMeta?.numberFormat ?? '');
          const isCustomFmtValid = isValidNumberFormat(customNumFmt);

          const applyNumFmt = (pattern: string) => {
            const trimmed = pattern.trim();
            if (!isValidNumberFormat(trimmed)) return;
            applyStyleToSelection((s) => ({
              ...s,
              numberFormat: trimmed.length > 0 ? trimmed : undefined,
            }));
          };

          return (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 2px)',
                left: hostMode === 'vscode' ? 10 : 72,
                zIndex: 60,
                width: 304,
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  {isColumnSelectionMode
                    ? 'Columns Style (.metatext.jsonc)'
                    : 'Cell Style (.metatext.jsonc)'}
                </div>
                <button
                  type="button"
                  disabled={!hasStyleTarget}
                  style={{
                    ...btnStyle,
                    height: 22,
                    padding: '2px 6px',
                    fontSize: 11,
                    opacity: hasStyleTarget ? 1 : 0.45,
                  }}
                  title="Clear all style overrides on selection"
                  onClick={() => {
                    applyStyleToSelection(() => ({}), true);
                    setCustomNumFmt('');
                  }}
                >
                  <X size={11} />
                  <span>Clear</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  disabled={!hasStyleTarget}
                  style={{ ...btnStyle, padding: '3px 8px', opacity: hasStyleTarget ? 1 : 0.45 }}
                  title="Toggle Bold on selection"
                  onClick={() => applyStyleToSelection((s) => ({ ...s, bold: !s.bold }))}
                >
                  <Bold size={13} />
                  <span>Bold</span>
                </button>
                <button
                  type="button"
                  disabled={!hasStyleTarget}
                  style={{ ...btnStyle, padding: '3px 8px', opacity: hasStyleTarget ? 1 : 0.45 }}
                  title="Toggle Italic on selection"
                  onClick={() => applyStyleToSelection((s) => ({ ...s, italic: !s.italic }))}
                >
                  <Italic size={13} />
                  <span>Italic</span>
                </button>
                <button
                  type="button"
                  disabled={!hasStyleTarget}
                  style={{
                    ...btnStyle,
                    padding: '3px 8px',
                    borderColor: activeWrap ? '#3b82f6' : toolbarBorder,
                    background: activeWrap
                      ? isDark
                        ? '#1e3a8a'
                        : '#dbeafe'
                      : btnStyle.background,
                    opacity: hasStyleTarget ? 1 : 0.45,
                  }}
                  title={
                    isColumnSelectionMode
                      ? 'Toggle text wrapping for selected column(s)'
                      : 'Toggle text wrapping for selected cell(s) and auto-fit row height'
                  }
                  onClick={() => {
                    if (!hasStyleTarget) return;
                    const nextWrap = !activeWrap;
                    applyStyleToSelection((s) => ({ ...s, wrap: nextWrap ? true : undefined }));
                    if (!isColumnSelectionMode && selection.current) {
                      const { range, cell } = selection.current;
                      const startY = range.height > 1 ? range.y : cell[1];
                      const endY = range.height > 1 ? range.y + range.height - 1 : cell[1];
                      const startX = range.width > 1 ? range.x : cell[0];
                      const endX = range.width > 1 ? range.x + range.width - 1 : cell[0];
                      const targetRows: number[] = [];
                      for (let vr = startY; vr <= endY && targetRows.length < 50; vr++) {
                        const dr = viewRowIndices[vr];
                        if (dr !== undefined) targetRows.push(dr);
                      }
                      const targetCols = new Set<number>();
                      for (let vc = startX; vc <= endX; vc++) {
                        const ac = visibleColIndices[vc];
                        if (ac !== undefined) targetCols.add(ac);
                      }
                      if (nextWrap) {
                        autoFitRows(targetRows, targetCols);
                      } else {
                        autoFitRows(targetRows, undefined, targetCols);
                      }
                    }
                  }}
                >
                  <WrapText size={13} />
                  <span>Wrap</span>
                </button>
              </div>

              {/* Alignment (Left / Center / Right) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.75 }}>Alignment</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {(
                    [
                      { value: 'left' as const, label: 'Align Left', Icon: AlignLeft },
                      { value: 'center' as const, label: 'Align Center', Icon: AlignCenter },
                      { value: 'right' as const, label: 'Align Right', Icon: AlignRight },
                    ]
                  ).map(({ value, label, Icon }) => {
                    const isSelected = activeAlign === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!hasStyleTarget}
                        title={label}
                        aria-label={label}
                        style={{
                          ...btnStyle,
                          width: 28,
                          height: 24,
                          padding: 0,
                          borderColor: isSelected ? '#3b82f6' : toolbarBorder,
                          background: isSelected
                            ? isDark
                              ? '#1e3a8a'
                              : '#dbeafe'
                            : btnStyle.background,
                          opacity: hasStyleTarget ? 1 : 0.45,
                        }}
                        onClick={() =>
                          applyStyleToSelection((s) => ({
                            ...s,
                            align: activeAlign === value ? undefined : value,
                          }))
                        }
                      >
                        <Icon size={13} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.75 }}>Background Color</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {BG_SWATCH_COLORS.map((sw) => (
                    <button
                      key={sw.label}
                      type="button"
                      disabled={!hasStyleTarget}
                      title={`Background: ${sw.label}`}
                      style={{
                        ...btnStyle,
                        width: 22,
                        height: 22,
                        padding: 0,
                        opacity: hasStyleTarget ? 1 : 0.45,
                        background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
                      }}
                      onClick={() =>
                        applyStyleToSelection((s) => ({ ...s, backgroundColor: sw.value }))
                      }
                    >
                      {sw.value === undefined ? <X size={11} /> : ' '}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.75 }}>Text Color</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {TEXT_SWATCH_COLORS.map((sw) => (
                    <button
                      key={sw.label}
                      type="button"
                      disabled={!hasStyleTarget}
                      title={`Text Color: ${sw.label}`}
                      style={{
                        ...btnStyle,
                        width: 22,
                        height: 22,
                        padding: 0,
                        borderRadius: '50%',
                        opacity: hasStyleTarget ? 1 : 0.45,
                        background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
                      }}
                      onClick={() =>
                        applyStyleToSelection((s) => ({ ...s, color: sw.value }))
                      }
                    >
                      {sw.value === undefined ? <X size={11} /> : ' '}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number & Date Format (Excel / numfmt) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>Format (Number / Date)</span>
                  {activeNumFmt && (
                    <code style={{ fontSize: 10.5, opacity: 0.8 }}>{activeNumFmt}</code>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {NUMBER_FORMAT_PRESETS.map((preset) => {
                    const isCurrent = activeNumFmt === preset.pattern;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!hasStyleTarget}
                        title={`${preset.description}${preset.pattern ? ` (${preset.pattern})` : ''}`}
                        style={{
                          ...btnStyle,
                          height: 22,
                          padding: '1px 6px',
                          fontSize: 11,
                          borderColor: isCurrent ? '#3b82f6' : toolbarBorder,
                          background: isCurrent
                            ? isDark
                              ? '#1e3a8a'
                              : '#dbeafe'
                            : btnStyle.background,
                          opacity: hasStyleTarget ? 1 : 0.45,
                        }}
                        onClick={() => {
                          setCustomNumFmt(preset.pattern);
                          applyNumFmt(preset.pattern);
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {DATE_FORMAT_PRESETS.map((preset) => {
                    const isCurrent = activeNumFmt === preset.pattern;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!hasStyleTarget}
                        title={`${preset.description} (${preset.pattern})`}
                        style={{
                          ...btnStyle,
                          height: 22,
                          padding: '1px 6px',
                          fontSize: 11,
                          borderColor: isCurrent ? '#3b82f6' : toolbarBorder,
                          background: isCurrent
                            ? isDark
                              ? '#1e3a8a'
                              : '#dbeafe'
                            : btnStyle.background,
                          opacity: hasStyleTarget ? 1 : 0.45,
                        }}
                        onClick={() => {
                          setCustomNumFmt(preset.pattern);
                          applyNumFmt(preset.pattern);
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    disabled={!hasStyleTarget}
                    value={customNumFmt}
                    placeholder={activeNumFmt || 'Custom e.g. #,##0, yyyy/mm/dd, mmm d, yyyy'}
                    onChange={(e) => setCustomNumFmt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isCustomFmtValid) {
                        applyNumFmt(customNumFmt);
                      }
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 24,
                      padding: '2px 7px',
                      fontSize: 11.5,
                      borderRadius: 4,
                      border: `1px solid ${isCustomFmtValid ? toolbarBorder : '#ef4444'}`,
                      background: isDark ? '#141416' : '#ffffff',
                      color: toolbarFg,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    disabled={!hasStyleTarget || !isCustomFmtValid}
                    style={{
                      ...btnStyle,
                      height: 24,
                      padding: '2px 8px',
                      fontSize: 11,
                      opacity: hasStyleTarget && isCustomFmtValid ? 1 : 0.45,
                    }}
                    onClick={() => applyNumFmt(customNumFmt)}
                  >
                    Apply
                  </button>
                </div>
              </div>

              <button
                type="button"
                style={{ ...btnStyle, width: '100%', justifyContent: 'space-between' }}
                onClick={() => {
                  setOpenMenu('none');
                  setShowRulesModal(true);
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} />
                  <span>Conditional Rules...</span>
                </span>
                <span style={{ opacity: 0.7 }}>
                  {meta.rules !== undefined
                    ? meta.rules.length
                    : defaultHighlightRules.length > 0
                      ? `${defaultHighlightRules.length} (auto)`
                      : 0}
                </span>
              </button>
            </div>
          );
        })()}
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
                ? 'Reading file...'
                : loadingProgress.phase === 'parsing'
                  ? `Parsing ${activeFormat.toUpperCase()}... (${loadingProgress.rowsParsed.toLocaleString()} rows)`
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

        {csvData && (() => {
          const showRowNums = appSettings?.showRowNumbers !== false;
          const baseRowMarkerWidth =
            viewRowIndices.length >= 1_000_000
              ? 72
              : viewRowIndices.length >= 100_000
                ? 64
                : viewRowIndices.length >= 10_000
                  ? 56
                  : 48;
          const rowMarkerWidth = Math.max(44, Math.round(baseRowMarkerWidth * zoomScale));
          const cornerLabel = appSettings?.noHeaderColumnStyle === 'numbered' ? 'R1C1' : 'A1';
          const isAllSelected =
            viewRowIndices.length > 0 && selection.rows.length === viewRowIndices.length;

          return (
            <>
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
                onHeaderContextMenu={onHeaderContextMenu}
                onMouseMove={onGridMouseMove}
                onVisibleRegionChanged={(range) => {
                  if (range.width <= 0 || range.height <= 0) return;
                  if (pendingRestoreSnapshotRef.current) {
                    applyPendingViewRestore();
                    return;
                  }
                  if (isActiveRef.current) {
                    visibleRegionRef.current = { x: range.x, y: range.y };
                  }
                }}
                gridSelection={selection}
                onGridSelectionChange={setSelection}
                rowHeight={rowHeightProp}
                headerHeight={scaledHeaderHeight}
                freezeColumns={meta.table?.freezeColumns ?? 0}
                rowMarkers={
                  showRowNums
                    ? {
                        kind: 'clickable-number',
                        width: rowMarkerWidth,
                        theme: {
                          accentLight: 'transparent',
                          textLight: gridTheme.textHeader,
                          textMedium: gridTheme.textHeader,
                          markerFontStyle: `${Math.max(11, Math.round(scaledFontSize * 0.92))}px`,
                        },
                      }
                    : 'none'
                }
                trapFocus={true}
                smoothScrollX
                smoothScrollY
                theme={gridTheme}
                getCellsForSelection={true}
                keybindings={{ search: false }}
              />
              {/* Excel-style top-left corner cell (A1 / R1C1 matching app setting, click to select all) */}
              {showRowNums && (
                <button
                  type="button"
                  aria-label={`Select all (${cornerLabel})`}
                  title={`Select all (${cornerLabel} reference style)`}
                  onClick={() => {
                    if (viewRowIndices.length === 0) return;
                    if (isAllSelected) {
                      setSelection({
                        columns: CompactSelection.empty(),
                        rows: CompactSelection.empty(),
                      });
                    } else {
                      setSelection({
                        columns: CompactSelection.empty(),
                        rows: CompactSelection.fromSingleSelection([0, viewRowIndices.length]),
                      });
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: rowMarkerWidth,
                    height: scaledHeaderHeight,
                    zIndex: 15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    border: 'none',
                    borderRight: `1px solid ${gridTheme.borderColor ?? toolbarBorder}`,
                    borderBottom: `1px solid ${gridTheme.borderColor ?? toolbarBorder}`,
                    background: gridTheme.bgHeader ?? toolbarBg,
                    color: gridTheme.textHeader ?? toolbarFg,
                    fontSize: Math.max(10, Math.round(11 * zoomScale)),
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ opacity: 0.78 }}>{cornerLabel}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 3,
                      bottom: 3,
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderBottom: `6px solid ${
                        isAllSelected
                          ? '#3b82f6'
                          : isDark
                            ? 'rgba(148, 163, 184, 0.55)'
                            : 'rgba(100, 116, 139, 0.55)'
                      }`,
                      pointerEvents: 'none',
                    }}
                  />
                </button>
              )}

              {/* Inline column header title editor */}
              {editingHeaderCol && (
                <input
                  type="text"
                  autoFocus
                  value={editingHeaderCol.value}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setEditingHeaderCol((prev) =>
                      prev ? { ...prev, value: e.target.value } : null,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitHeaderTitleEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingHeaderCol(null);
                    }
                  }}
                  onBlur={() => commitHeaderTitleEdit()}
                  style={{
                    position: 'absolute',
                    left: editingHeaderCol.left,
                    top: editingHeaderCol.top,
                    width: Math.max(80, editingHeaderCol.width),
                    height: editingHeaderCol.height,
                    zIndex: 45,
                    padding: '0 8px',
                    fontSize: scaledFontSize,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    border: '2px solid #3b82f6',
                    borderRadius: 2,
                    background: isDark ? '#18181b' : '#ffffff',
                    color: toolbarFg,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              )}

              {/* Column Header Right-Click Context Menu */}
              {headerContextMenu && (() => {
                const { visCols, actualCols, colKeys, x, y, headerBounds } = headerContextMenu;
                const isMulti = actualCols.length > 1;
                const firstActual = actualCols[0]!;
                const lastActual = actualCols[actualCols.length - 1]!;
                const firstKey = colKeys[0]!;
                const adjacentHidden = getAdjacentHiddenColumnKeys(visCols);
                const canShiftLeft = !isReadOnly && firstActual > 0;
                const canShiftRight =
                  !isReadOnly && lastActual < (csvData?.columnKeys.length ?? 1) - 1;
                const canDelete =
                  !isReadOnly && actualCols.length < (csvData?.columnKeys.length ?? 0);
                const canHide = visibleColIndices.length - colKeys.length >= 1;
                const ctxItemStyle = (disabled = false): React.CSSProperties => ({
                  ...menuItemStyle,
                  padding: '5px 8px',
                  opacity: disabled ? 0.42 : 1,
                  cursor: disabled ? 'default' : 'pointer',
                });
                const sep = (
                  <hr
                    style={{
                      border: 'none',
                      borderTop: `1px solid ${toolbarBorder}`,
                      margin: '3px 0',
                    }}
                  />
                );

                return (
                  <div
                    ref={headerMenuRef}
                    role="menu"
                    style={{
                      position: 'fixed',
                      left: x,
                      top: y,
                      zIndex: 80,
                      width: 262,
                      padding: 5,
                      borderRadius: 6,
                      background: isDark ? '#1f1f23' : '#ffffff',
                      border: `1px solid ${toolbarBorder}`,
                      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.34)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      color: toolbarFg,
                    }}
                  >
                    <button
                      type="button"
                      disabled={isMulti}
                      style={ctxItemStyle(isMulti)}
                      onClick={() => {
                        if (isMulti) return;
                        const containerRect = gridContainerRef.current?.getBoundingClientRect();
                        const currentTitle =
                          meta.columns?.[firstKey]?.label ?? getDefaultColumnTitle(firstActual);
                        setHeaderContextMenu(null);
                        setEditingHeaderCol({
                          actualCol: firstActual,
                          colKey: firstKey,
                          value: currentTitle,
                          left: containerRect
                            ? Math.max(0, headerBounds.x - containerRect.left)
                            : 0,
                          top: containerRect
                            ? Math.max(0, headerBounds.y - containerRect.top)
                            : 0,
                          width: headerBounds.width,
                          height: headerBounds.height,
                        });
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Pencil size={13} />
                        <span>タイトル編集</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      style={ctxItemStyle(false)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        setSelection({
                          columns: CompactSelection.fromSingleSelection([
                            visCols[0]!,
                            visCols[visCols.length - 1]! + 1,
                          ]),
                          rows: CompactSelection.empty(),
                        });
                        setOpenMenu('edit');
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Palette size={13} />
                        <span>スタイル</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      style={ctxItemStyle(false)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        void handleCopyColumns(actualCols, colKeys);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Copy size={13} />
                        <span>コピー</span>
                      </span>
                      <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+C</span>
                    </button>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        void handlePasteColumns(firstActual, true);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <ClipboardPaste size={13} />
                        <span>貼り付け (スタイルあり)</span>
                      </span>
                      <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+V</span>
                    </button>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        void handlePasteColumns(firstActual, false);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <ClipboardPaste size={13} />
                        <span>値のみ貼り付け</span>
                      </span>
                      <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+V</span>
                    </button>

                    <button
                      type="button"
                      disabled={!canDelete}
                      style={ctxItemStyle(!canDelete)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleDeleteColumns(actualCols, colKeys);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Trash2 size={13} />
                        <span>{isMulti ? `削除 (${actualCols.length}列)` : '削除'}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!canHide}
                      style={ctxItemStyle(!canHide)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleHideColumns(actualCols, colKeys);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <EyeOff size={13} />
                        <span>{isMulti ? `列の非表示 (${actualCols.length}列)` : '列の非表示'}</span>
                      </span>
                    </button>

                    {adjacentHidden.length > 0 && (
                      <button
                        type="button"
                        style={ctxItemStyle(false)}
                        onClick={() => {
                          setHeaderContextMenu(null);
                          handleUnhideColumns(adjacentHidden);
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <Eye size={13} />
                          <span>非表示列を再表示 ({adjacentHidden.length})</span>
                        </span>
                      </button>
                    )}

                    {sep}

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleDuplicateColumns(actualCols, colKeys, 'left');
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Columns2 size={13} />
                        <span>{isMulti ? `${actualCols.length}列を左に複製` : '列を左に複製'}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleDuplicateColumns(actualCols, colKeys, 'right');
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Columns2 size={13} />
                        <span>{isMulti ? `${actualCols.length}列を右に複製` : '列を右に複製'}</span>
                      </span>
                    </button>

                    {sep}

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleInsertBlankColumns(actualCols, 'left');
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Plus size={13} />
                        <span>
                          {isMulti ? `左に空白列挿入 (${actualCols.length}列)` : '左に空白列挿入'}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      style={ctxItemStyle(isReadOnly)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleInsertBlankColumns(actualCols, 'right');
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Plus size={13} />
                        <span>
                          {isMulti ? `右に空白列挿入 (${actualCols.length}列)` : '右に空白列挿入'}
                        </span>
                      </span>
                    </button>

                    {sep}

                    <button
                      type="button"
                      disabled={!canShiftLeft}
                      style={ctxItemStyle(!canShiftLeft)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleShiftColumns(visCols, actualCols, -1);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <ArrowLeft size={13} />
                        <span>列を左にずらす</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!canShiftRight}
                      style={ctxItemStyle(!canShiftRight)}
                      onClick={() => {
                        setHeaderContextMenu(null);
                        handleShiftColumns(visCols, actualCols, 1);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <ArrowRight size={13} />
                        <span>列を右にずらす</span>
                      </span>
                    </button>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* Excel-like row height resize hit strip over row-number border (drag or double-click to auto-fit) */}
        {hoverRowResize && !rowResizeDrag && (
          <div
            onMouseLeave={() => setHoverRowResize(null)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.detail >= 2) {
                autoFitRows([hoverRowResize.dataRow], new Set(visibleColIndices));
                setHoverRowResize(null);
                return;
              }
              const renderedH = hoverRowResize.bottomLocalY - hoverRowResize.topLocalY;
              const startBase =
                explicitRowHeightMap.get(hoverRowResize.dataRow) ??
                Math.max(20, Math.min(400, Math.round(renderedH / (zoomScale || 1))));
              setRowResizeDrag({
                dataRow: hoverRowResize.dataRow,
                topLocalY: hoverRowResize.topLocalY,
                startClientY: e.clientY,
                startBaseHeight: startBase,
                currentBaseHeight: startBase,
                guideLocalY: hoverRowResize.bottomLocalY,
              });
            }}
            title="Drag to resize row height · Double-click to auto-fit"
            style={{
              position: 'absolute',
              left: hoverRowResize.leftLocalX,
              top: hoverRowResize.bottomLocalY - 5,
              width: hoverRowResize.width,
              height: 10,
              cursor: 'ns-resize',
              zIndex: 25,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                height: 2,
                background: 'rgba(59, 130, 246, 0.7)',
              }}
            />
          </div>
        )}

        {rowResizeDrag && (
          <>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: rowResizeDrag.guideLocalY,
                height: 2,
                background: '#3b82f6',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 52,
                top: Math.max(4, rowResizeDrag.guideLocalY - 22),
                padding: '1px 7px',
                borderRadius: 4,
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                pointerEvents: 'none',
                zIndex: 41,
              }}
            >
              Row #{rowResizeDrag.dataRow + 1}: {rowResizeDrag.currentBaseHeight}px
            </div>
          </>
        )}
      </div>

      {/* Optional Cell Inspector Drawer (for reading full multiline cells & stack traces) */}
      {showCellInspector && csvData && (
        <div
          style={{
            height: 132,
            display: 'flex',
            flexDirection: 'column',
            borderTop: `1px solid ${toolbarBorder}`,
            background: isDark ? '#18181b' : '#f8fafc',
            color: toolbarFg,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              borderBottom: `1px solid ${toolbarBorder}`,
              fontSize: 11.5,
              background: toolbarBg,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileText size={12} />
              <strong>
                {selectedDataRow !== undefined && selectedColLabel
                  ? `Row #${selectedDataRow + 1} · ${selectedColLabel}`
                  : 'Cell Inspector (select a cell)'}
              </strong>
              {selectedCellLineCount > 1 && (
                <span style={{ opacity: 0.7 }}>({selectedCellLineCount} lines)</span>
              )}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {selectedCellValue.length > 0 && (
                <button
                  type="button"
                  style={{ ...btnStyle, height: 20, padding: '1px 7px', fontSize: 11 }}
                  onClick={() => {
                    void navigator.clipboard?.writeText(selectedCellValue);
                    setStatusMsg('Copied cell text');
                  }}
                >
                  <Copy size={11} />
                  <span>Copy</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Close cell inspector"
                style={{ ...btnStyle, height: 20, padding: '1px 5px' }}
                onClick={() => setShowCellInspector(false)}
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={selectedCellValue}
            placeholder="Select any cell in the grid to inspect full multiline content or stack traces..."
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              padding: '6px 10px',
              background: isDark ? '#141416' : '#ffffff',
              color: toolbarFg,
              fontFamily:
                activeFormat === 'log' || activeFormat === 'jsonl'
                  ? "'Consolas', 'Courier New', monospace"
                  : 'inherit',
              fontSize: 12,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
            }}
          />
        </div>
      )}

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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, position: 'relative' }}>
            <span
              onMouseEnter={() => {
                if (filePath) setShowPathTooltip(true);
              }}
              onMouseLeave={() => setShowPathTooltip(false)}
              style={{
                fontWeight: dirtyCsv ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: filePath ? 'default' : undefined,
              }}
              title={filePath || fileName}
            >
              {fileName || 'MetaText Editor'}
              {dirtyCsv ? ' *' : ''}
            </span>
            {showPathTooltip && filePath && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  zIndex: 80,
                  maxWidth: 'min(76vw, 720px)',
                  padding: '4px 8px',
                  borderRadius: 5,
                  background: isDark ? '#18181b' : '#ffffff',
                  color: toolbarFg,
                  border: `1px solid ${toolbarBorder}`,
                  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.28)',
                  fontSize: 11,
                  fontFamily: "'Consolas', 'Courier New', monospace",
                  lineHeight: 1.35,
                  wordBreak: 'break-all',
                  pointerEvents: 'none',
                }}
              >
                {filePath}
              </div>
            )}
            {csvData && (
              <span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>
                {activeFormat.toUpperCase()} · {csvData.dialect.encoding.toUpperCase()} · {csvData.dialect.lineEnding.toUpperCase()}
                {isReadOnly ? ' · RO' : ''}
                {csvData.invalidLineCount ? ` · ${csvData.invalidLineCount} raw` : ''}
              </span>
            )}
            {statusMsg && (
              <span style={{ opacity: 0.78, whiteSpace: 'nowrap' }}>{statusMsg}</span>
            )}
          </div>
          {csvData && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, opacity: 0.85, whiteSpace: 'nowrap' }}>
              {selectedCellLineCount > 1 && !showCellInspector && (
                <button
                  type="button"
                  onClick={() => setShowCellInspector(true)}
                  style={{
                    border: `1px solid ${toolbarBorder}`,
                    borderRadius: 4,
                    background: 'transparent',
                    color: toolbarFg,
                    fontSize: 11,
                    padding: '0 6px',
                    cursor: 'pointer',
                  }}
                >
                  {selectedCellLineCount} lines (Inspect)
                </button>
              )}
              {zoomScale !== 1 && (
                <button
                  type="button"
                  title="Reset zoom to 100% (Ctrl+0)"
                  onClick={() => setZoomScale(1)}
                  style={{
                    border: `1px solid ${toolbarBorder}`,
                    borderRadius: 4,
                    background: 'transparent',
                    color: toolbarFg,
                    fontSize: 11,
                    padding: '0 6px',
                    cursor: 'pointer',
                  }}
                >
                  {Math.round(zoomScale * 100)}%
                </button>
              )}
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
                format: activeFormat,
                readOnly: isReadOnly,
                onReadOnlyChange: (next) => {
                  setIsReadOnly(next);
                  patchMeta(['readOnly'], next);
                },
                hasHeader: meta.csv?.hasHeader ?? true,
                onHasHeaderChange: (next) => patchMeta(['csv', 'hasHeader'], next),
                jsonlFlattenDepth: meta.jsonl?.flattenDepth ?? 2,
                onJsonlFlattenDepthChange: (next) => patchMeta(['jsonl', 'flattenDepth'], next),
                jsonlArrayMode: meta.jsonl?.arrayMode ?? ('json' satisfies JsonlArrayMode),
                onJsonlArrayModeChange: (next) => patchMeta(['jsonl', 'arrayMode'], next),
                logLinePattern: meta.log?.linePattern ?? csvData.logOptions?.linePattern ?? '',
                logColumnNames: meta.log?.columnNames ?? csvData.logOptions?.columnNames,
                logMultilinePattern:
                  meta.log?.multilinePattern ?? csvData.logOptions?.multilinePattern ?? '',
                logWordWrap: meta.log?.wordWrap ?? csvData.logOptions?.wordWrap ?? false,
                logMatchedPresetId: csvData.logOptions?.matchedPresetId,
                logRegexError: csvData.logOptions?.regexError,
                logSampleLines: csvData.sampleLines,
                onLogConfigChange: (patch: Partial<LogParserConfig>) => {
                  let text = metaTextRef.current ?? '';
                  for (const [k, v] of Object.entries(patch)) {
                    text = patchMetaJsonc(text, ['log', k], v);
                  }
                  scheduleMetaSave(text);
                },
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
                  const defaultWrap =
                    activeFormat === 'log' || activeFormat === 'text'
                      ? (meta.log?.wordWrap ?? false)
                      : false;
                  return {
                    key,
                    label: colMeta?.label ?? getDefaultColumnTitle(idx),
                    visible: colMeta?.visible !== false,
                    wrap: colMeta?.wrap ?? defaultWrap,
                  };
                }),
                onToggleColumnVisible: (key, visible) => {
                  if (!visible && visibleColIndices.length <= 1) return;
                  patchMeta(['columns', key, 'visible'], visible);
                },
                onToggleColumnWrap: (key, wrap) => {
                  patchMeta(['columns', key, 'wrap'], wrap);
                },
              } satisfies FileLayoutSettingsProps)
            : undefined
        }
        extraSection={settingsExtraSection}
      />
      <ConditionalRulesModal
        open={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        themeMode={themeMode}
        columns={filterColumnOptions.map((c) => ({ key: c.key, label: c.label }))}
        rules={meta.rules ?? []}
        defaultRules={defaultHighlightRules}
        usingDefaultRules={meta.rules === undefined && defaultHighlightRules.length > 0}
        styles={meta.styles}
        onChangeRules={(next: ConditionalRule[]) => patchMeta(['rules'], next)}
      />
      <AboutModal
        open={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        themeMode={themeMode}
        hostMode={hostMode}
      />

      {/* Column Delete Confirmation Dialog */}
      {pendingDeleteCol && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingDeleteCol(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="列の削除"
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 10,
              background: isDark ? '#1f1f23' : '#ffffff',
              color: toolbarFg,
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Trash2 size={15} style={{ color: '#ef4444' }} />
              <span>列の削除</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
              <strong>{pendingDeleteCol.label}</strong>を削除しますか？
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                autoFocus
                style={{ ...btnStyle, padding: '4px 12px', height: 28 }}
                onClick={() => setPendingDeleteCol(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={{
                  ...btnStyle,
                  padding: '4px 12px',
                  height: 28,
                  background: '#dc2626',
                  borderColor: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
                onClick={() => {
                  const target = pendingDeleteCol;
                  setPendingDeleteCol(null);
                  executeDeleteColumns(target.actualCols, target.colKeys, target.label);
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Hide Guidance Dialog (with "Don't show again" synced to Settings -> Columns) */}
      {pendingHideCol && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingHideCol(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="列の非表示"
            style={{
              width: '100%',
              maxWidth: 400,
              borderRadius: 10,
              background: isDark ? '#1f1f23' : '#ffffff',
              color: toolbarFg,
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <EyeOff size={15} />
              <span>列の非表示</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
              <strong>{pendingHideCol.label}</strong>を非表示にします。
              <br />
              再表示は設定画面（Settings → File → Columns）から行ってください。
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={pendingHideCol.dontShowAgain}
                onChange={(e) =>
                  setPendingHideCol((prev) =>
                    prev ? { ...prev, dontShowAgain: e.target.checked } : null,
                  )
                }
              />
              <span>次回から表示しない</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                style={{ ...btnStyle, padding: '4px 12px', height: 28 }}
                onClick={() => setPendingHideCol(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={{
                  ...btnStyle,
                  padding: '4px 12px',
                  height: 28,
                  background: '#2563eb',
                  borderColor: '#3b82f6',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
                onClick={() => {
                  const target = pendingHideCol;
                  setPendingHideCol(null);
                  if (target.dontShowAgain) {
                    if (onAppSettingsChange) {
                      onAppSettingsChange({ confirmHideColumn: false });
                    } else {
                      setLocalConfirmHideCol(false);
                    }
                  }
                  executeHideColumns(target.colKeys, target.label);
                }}
              >
                非表示にする
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  },
);
