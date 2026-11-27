import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CompactSelection,
  DataEditor,
  type DataEditorRef,
  type GridColumn,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_META_VERSION,
  DEFAULT_ROW_HEIGHT,
  type ConditionalRule,
  type FilterPreset,
  type MarkerColor,
  type MetaTextDocument,
  type MetaTextFormat,
  type SortSpec,
} from '@metatext-editor/schema';
import {
  UndoRedoHistory,
  isMetaTextZipFileName,
  type ParseProgress,
  type ParsedCsvData,
} from '@metatext-editor/core';
import { FilterBar } from './FilterBar';
import { AboutModal, SettingsModal } from './SettingsAboutDialogs';
import { ConditionalRulesModal } from './ConditionalRulesModal';
import { useInputHistory } from './useInputHistory';
import type { CopiedColumnPayload, CopiedRowsPayload } from './columnClipboard';
import type {
  CellContextMenuState,
  EditingHeaderColState,
  EditorViewSnapshot,
  HeaderContextMenuState,
  MetaTextEditorHandle,
  MetaTextEditorProps,
  PendingDeleteColState,
  PendingDeleteRowsState,
  PendingHideColState,
  RowContextMenuState,
} from './editor/types';
import type { CopiedCellsPayload } from './editor/utils/cellClipboard';
import { buildFileLayoutSettings } from './editor/utils/buildFileLayoutSettings';
import { useDocumentLoader } from './editor/hooks/useDocumentLoader';
import { useEditorViewPipeline } from './editor/hooks/useEditorViewPipeline';
import { useMarkerActions } from './editor/hooks/useMarkerActions';
import { useEditorSearchAndStatus } from './editor/hooks/useEditorSearchAndStatus';
import { useGridRendering } from './editor/hooks/useGridRendering';
import { useLiveTail } from './editor/hooks/useLiveTail';
import { useColumnOperations } from './editor/hooks/useColumnOperations';
import { useRowOperations } from './editor/hooks/useRowOperations';
import { useCellOperations } from './editor/hooks/useCellOperations';
import { useFileSaveAndUndo } from './editor/hooks/useFileSaveAndUndo';
import { useViewSnapshotRestore } from './editor/hooks/useViewSnapshotRestore';
import { useStyleActions } from './editor/hooks/useStyleActions';
import {
  useRowHeight,
  type HoverRowResizeState,
  type RowResizeDragState,
} from './editor/hooks/useRowHeight';
import { useEditorShortcuts } from './editor/hooks/useEditorShortcuts';
import { EditorToolbar } from './editor/components/EditorToolbar';
import { ColumnContextMenu } from './editor/components/ColumnContextMenu';
import { RowContextMenu } from './editor/components/RowContextMenu';
import { CellContextMenu } from './editor/components/CellContextMenu';
import { RowResizeOverlay } from './editor/components/RowResizeOverlay';
import { LoadingProgressOverlay } from './editor/components/LoadingProgressOverlay';
import { GridCornerAndHeaderInput } from './editor/components/GridCornerAndHeaderInput';
import { CellInspectorDrawer } from './editor/components/CellInspectorDrawer';
import { HistorySidePanel } from './editor/components/HistorySidePanel';
import { LiveTailPanel } from './editor/components/LiveTailPanel';
import { EditorStatusBar } from './editor/components/EditorStatusBar';
import { EditorConfirmDialogs } from './editor/components/EditorConfirmDialogs';
import { ExportBundleModal } from './dialogs/ExportBundleModal';
import { useSnapshotHistory } from './editor/hooks/useSnapshotHistory';

export type {
  EditorStatusInfo,
  EditorViewSnapshot,
  MetaTextEditorHandle,
  MetaTextEditorProps,
} from './editor/types';

export const MetaTextEditor = React.forwardRef<MetaTextEditorHandle, MetaTextEditorProps>(
  function MetaTextEditor(
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
      onSaveAsStream,
      onCloseFile,
      fileMenuItems,
      settingsExtraSection,
      onDocumentEdit,
      onDirtyChange,
      onStatusChange,
      externalMetaText,
      onMetaTextChange,
      nativeClipboard,
      historyAdapter,
      showHistoryPanel: controlledShowHistoryPanel,
      onToggleHistoryPanel: controlledToggleHistoryPanel,
      historyRefreshTick,
      externalSavingSnapshot = false,
      onExportBundle,
    },
    ref,
  ) {
  const [internalShowHistoryPanel, setInternalShowHistoryPanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportHistoryBytes, setExportHistoryBytes] = useState<number | null>(null);
  const showHistoryPanel = controlledShowHistoryPanel ?? internalShowHistoryPanel;
  const handleToggleHistoryPanel = useCallback(() => {
    if (controlledToggleHistoryPanel) {
      controlledToggleHistoryPanel();
    } else {
      setInternalShowHistoryPanel((s) => !s);
    }
  }, [controlledToggleHistoryPanel]);
  const [fileName, setFileName] = useState<string>('');
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null);
  const [meta, setMeta] = useState<MetaTextDocument>({ version: DEFAULT_META_VERSION });
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
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenuState | null>(null);
  const [pendingDeleteRows, setPendingDeleteRows] = useState<PendingDeleteRowsState | null>(null);
  const [localConfirmHideCol, setLocalConfirmHideCol] = useState<boolean | null>(null);
  const shouldConfirmHideColumn =
    localConfirmHideCol ?? (appSettings?.confirmHideColumn !== false);
  useEffect(() => {
    setLocalConfirmHideCol(null);
  }, [appSettings?.confirmHideColumn]);
  const copiedColumnRef = useRef<CopiedColumnPayload | null>(null);
  const copiedRowsRef = useRef<CopiedRowsPayload | null>(null);
  const copiedCellsRef = useRef<CopiedCellsPayload | null>(null);
  const isF2EditTriggerRef = useRef<boolean>(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const cellMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(initialViewSnapshot?.zoomScale ?? 1);
  const [showCellInspector, setShowCellInspector] = useState<boolean>(
    initialViewSnapshot?.showCellInspector ?? false,
  );
  const zebraEnabled = meta.table?.zebraStriping ?? (appSettings?.zebraStriping !== false);
  const [fileBytes, setFileBytes] = useState<number>(0);
  const [hoverRowResize, setHoverRowResize] = useState<HoverRowResizeState | null>(null);
  const [rowResizeDrag, setRowResizeDrag] = useState<RowResizeDragState | null>(null);
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenu('none');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!headerContextMenu && !rowContextMenu && !cellContextMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerContextMenu && headerMenuRef.current && !headerMenuRef.current.contains(target)) {
        setHeaderContextMenu(null);
      }
      if (rowContextMenu && rowMenuRef.current && !rowMenuRef.current.contains(target)) {
        setRowContextMenu(null);
      }
      if (cellContextMenu && cellMenuRef.current && !cellMenuRef.current.contains(target)) {
        setCellContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHeaderContextMenu(null);
        setRowContextMenu(null);
        setCellContextMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [headerContextMenu, rowContextMenu, cellContextMenu]);

  useEffect(() => {
    onDirtyChange?.(dirtyCsv);
  }, [dirtyCsv, onDirtyChange]);

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialViewSnapshot?.searchQuery ?? '');
  const searchHistory = useInputHistory('metatext.searchHistory');

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
  const pendingJumpAfterInsertRef = useRef<{ dataRow: number; count: number } | null>(null);
  const rowsRef = useRef<string[][]>([]);
  const historyRef = useRef(new UndoRedoHistory());
  const metaTextRef = useRef<string | null>(null);

  const { scheduleMetaSave, patchMeta } = useDocumentLoader({
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
  });

  const {
    visibleColIndices,
    hiddenBeforeVisCols,
    hiddenAfterVisCols,
    getDefaultColumnTitle,
    filterColumnOptions,
    setSortApplyTick,
    insertRowsIntoOrder,
    removeRowsFromOrder,
    appendRowsToOrder,
    filterState,
    defaultHighlightRules,
    styleCtx,
  } = useEditorViewPipeline({
    csvData,
    meta,
    activeFormat,
    themeMode,
    noHeaderColumnStyle: appSettings?.noHeaderColumnStyle,
    rowsRef,
    filterQuery,
    debouncedFilterQuery,
    setDebouncedFilterQuery,
    filterContextRows,
    collapseColKey,
  });

  // Step 3: Row Markers (Bookmark & Jump)
  const {
    markers,
    markerMap,
    viewRowIndices,
    markedViewRows,
    visibleMarkerRowSet,
    selectedDataRow,
    selectedMarker,
    persistMarkers,
    toggleMarkerOnSelection,
    handleMarkerColorChange,
    handleUpdateMarkerNote,
    handleCycleMarkerColor,
    handleRemoveMarker,
    handleClearAllMarkers,
    jumpNextMarker,
    jumpPrevMarker,
    jumpToDataRow,
    getRowPreview,
  } = useMarkerActions({
    meta,
    filterIndices: filterState.indices,
    onlyMarked,
    setOnlyMarked,
    activeMarkerColor,
    setActiveMarkerColor,
    selection,
    setSelection,
    gridRef,
    rowsRef,
    patchMeta,
    setStatusMsg,
  });

  const {
    matches,
    activeMatchIdx,
    setActiveMatchIdx,
    activeMatch,
    matchSet,
    selectedColLabel,
    selectedCellWrap,
    selectedCellValue,
    selectedCellLineCount,
  } = useEditorSearchAndStatus({
    csvData,
    meta,
    activeFormat,
    isReadOnly,
    fileName,
    dirtyCsv,
    fileBytes,
    markerCount: markers.length,
    zoomScale,
    dataVersion,
    searchQuery,
    viewRowIndices,
    visibleColIndices,
    selection,
    selectedDataRow,
    styleCtx,
    getDefaultColumnTitle,
    rowsRef,
    gridRef,
    onStatusChange,
  });

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

  const { columns, gridTheme, getCellContent, drawCell, onCellEdited, onFinishedEditing } =
    useGridRendering({
      csvData,
      meta,
      themeMode,
      activeFormat,
      isReadOnly,
      visibleColIndices,
      viewRowIndices,
      autoWidths,
      zoomScale,
      scaledFontSize,
      effectiveDefaultFontSize,
      zebraEnabled,
      dataVersion,
      getDefaultColumnTitle,
      styleCtx,
      markerMap,
      matchSet,
      activeMatch,
      filterMatchedRowSet: filterState.matchedRowSet,
      filterCollapsedCounts: filterState.collapsedCounts,
      filterPositiveTerms: filterState.positiveTerms,
      collapseColKey,
      hiddenBeforeVisCols,
      hiddenAfterVisCols,
      selection,
      setSelection,
      rowsRef,
      historyRef,
      gridRef,
      gridContainerRef,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
    });

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

  // Apply explicit sort from column right-click menu
  const handleSortColumn = useCallback(
    (colKey: string, direction: 'asc' | 'desc' | null) => {
      const nextSort: SortSpec[] | undefined = direction
        ? [{ column: colKey, direction }]
        : undefined;
      patchMeta(['view', 'sort'], nextSort);
      setSortApplyTick((t) => t + 1);
      setStatusMsg(
        direction
          ? `Sorted "${colKey}" (${direction === 'asc' ? 'ascending' : 'descending'})`
          : 'Cleared sort order',
      );
    },
    [patchMeta],
  );

  // Column operations (context menu, rename, copy/paste, delete, hide/unhide, duplicate, insert, shift)
  const {
    onHeaderContextMenu,
    commitHeaderTitleEdit,
    handleCopyColumns,
    handlePasteColumns,
    executeDeleteColumns,
    handleDeleteColumns,
    executeHideColumns,
    handleHideColumns,
    getAdjacentHiddenColumnKeys,
    handleUnhideColumns,
    handleDuplicateColumns,
    handleInsertBlankColumns,
    handleShiftColumns,
  } = useColumnOperations({
    csvData,
    setCsvData,
    meta,
    metaTextRef,
    rowsRef,
    historyRef,
    copiedColumnRef,
    isReadOnly,
    activeFormat,
    autoWidths,
    setAutoWidths,
    visibleColIndices,
    viewRowIndices,
    selection,
    setSelection,
    editingHeaderCol,
    setEditingHeaderCol,
    setHeaderContextMenu,
    setOpenMenu,
    setPendingDeleteCol,
    setPendingHideCol,
    shouldConfirmHideColumn,
    getDefaultColumnTitle,
    appendRowsToOrder,
    patchMeta,
    scheduleMetaSave,
    setDirtyCsv,
    setDataVersion,
    setStatusMsg,
    onDocumentEdit,
    nativeClipboard,
  });

  // Row operations (context menu, copy/paste, delete, duplicate, insert blank)
  const {
    onCellContextMenu,
    handleCopyRows,
    handlePasteRows,
    executeDeleteRows,
    handleDeleteRows,
    handleDuplicateRows,
    handleInsertBlankRows,
  } = useRowOperations({
    csvData,
    setCsvData,
    meta,
    metaTextRef,
    rowsRef,
    historyRef,
    copiedRowsRef,
    pendingJumpAfterInsertRef,
    gridRef,
    isReadOnly,
    autoWidths,
    setAutoWidths,
    viewRowIndices,
    selection,
    setSelection,
    setOpenMenu,
    setHeaderContextMenu,
    setEditingHeaderCol,
    setRowContextMenu,
    setPendingDeleteRows,
    markers,
    persistMarkers,
    insertRowsIntoOrder,
    removeRowsFromOrder,
    appendRowsToOrder,
    debouncedFilterQuery,
    onlyMarked,
    scheduleMetaSave,
    setDirtyCsv,
    setDataVersion,
    setStatusMsg,
    onDocumentEdit,
    nativeClipboard,
  });

  // Cell operations (cell context menu, cell range copy/paste, Excel F2 edit, Tab/Enter in-range move)
  const {
    openCellContextMenu,
    handleCopyCells,
    handlePasteCells,
    startF2CellEdit,
    moveSelectionInRange,
  } = useCellOperations({
    csvData,
    setCsvData,
    meta,
    metaTextRef,
    rowsRef,
    historyRef,
    copiedCellsRef,
    isF2EditTriggerRef,
    gridRef,
    gridContainerRef,
    isReadOnly,
    autoWidths,
    setAutoWidths,
    visibleColIndices,
    viewRowIndices,
    styleCtx,
    selection,
    setSelection,
    setOpenMenu,
    setHeaderContextMenu,
    setRowContextMenu,
    setCellContextMenu,
    setEditingHeaderCol,
    appendRowsToOrder,
    scheduleMetaSave,
    setDirtyCsv,
    setDataVersion,
    setStatusMsg,
    onDocumentEdit,
    nativeClipboard,
  });

  const handleGridCellContextMenu = useCallback(
    (
      cell: readonly [number, number],
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      if (cell[0] === -1) {
        setCellContextMenu(null);
        onCellContextMenu(cell, event);
      } else {
        openCellContextMenu(cell, event);
      }
    },
    [onCellContextMenu, openCellContextMenu],
  );

  // Shadow Git snapshot history (Layer 2)
  const {
    policy: historyPolicy,
    snapshots,
    loadingSnapshots,
    savingSnapshot,
    activeSnapshotId,
    storageUsageBytes,
    diffBySnapshotId,
    loadingDiffId,
    refreshSnapshots,
    recordSaveSnapshotAsync,
    restoreSnapshotToView,
    computeSnapshotDiffWithCurrent,
  } = useSnapshotHistory({
    historyAdapter,
    appSettings,
    fileName,
    csvData,
    setCsvData,
    setAutoWidths,
    rowsRef,
    metaTextRef,
    isReadOnly,
    scheduleMetaSave,
    setDirtyCsv,
    setDataVersion,
    setStatusMsg,
    showHistoryPanel,
    historyRefreshTick,
  });

  // File save / Save As / New / Close / Undo / Redo
  const {
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
  } = useFileSaveAndUndo({
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
    onAfterSaveSnapshot: recordSaveSnapshotAsync,
    maxSnapshotDataBytes: historyPolicy.maxDataFileSizeMb * 1024 * 1024,
    skipSnapshotBytesCapture: Boolean(historyAdapter?.readsSavedFileDirectly),
  });

  const { applyPendingViewRestore } = useViewSnapshotRestore({
    ref,
    csvData,
    visibleColCount: visibleColIndices.length,
    viewRowCount: viewRowIndices.length,
    selection,
    setSelection,
    zoomScale,
    setZoomScale,
    filterQuery,
    filterContextRows,
    collapseColKey,
    onlyMarked,
    searchQuery,
    showCellInspector,
    gridRef,
    visibleRegionRef,
    pendingRestoreSnapshotRef,
    handleSaveCsv,
    serializeCurrentCsv,
    applyUndoLocal,
    applyRedoLocal,
    setReloadTick,
    setDirtyCsv,
  });

  useEditorShortcuts({
    isActive,
    hostMode,
    csvData,
    isReadOnly,
    selection,
    visibleColIndices,
    viewRowIndices,
    zoomScale,
    setZoomScale,
    gridContainerRef,
    isF2EditTriggerRef,
    hasSaveAs: Boolean(onSaveAs),
    hasNewFile: Boolean(onNewFile),
    hasCloseFile: Boolean(onCloseFile),
    handleSaveCsv,
    handleSaveAs,
    handleNewFileAction,
    handleCloseFileAction,
    handleUndo,
    handleRedo,
    toggleMarkerOnSelection,
    jumpNextMarker,
    jumpPrevMarker,
    handleCopyColumns,
    handlePasteColumns,
    handleCopyRows,
    handlePasteRows,
    handleCopyCells,
    handlePasteCells,
    startF2CellEdit,
    moveSelectionInRange,
  });

  const {
    selectedColumnKeys,
    isColumnSelectionMode,
    selectedRowDataIndices,
    isRowSelectionMode,
    applyStyleToSelection,
  } = useStyleActions({
    csvData,
    meta,
    metaTextRef,
    selection,
    visibleColIndices,
    viewRowIndices,
    patchMeta,
    scheduleMetaSave,
  });

  const {
    canTail,
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
  } = useLiveTail({
    adapter,
    isActive,
    csvData,
    meta,
    activeFormat,
    fileBytes,
    rowsRef,
    gridRef,
    viewRowCount: viewRowIndices.length,
    appendRowsToOrder,
    setFileBytes,
    setDataVersion,
    setReloadTick,
    setStatusMsg,
  });

  const { explicitRowHeightMap, rowHeightProp, autoFitRows, onGridMouseMove } = useRowHeight({
    csvData,
    meta,
    metaTextRef,
    rowsRef,
    gridContainerRef,
    activeFormat,
    visibleColIndices,
    viewRowIndices,
    autoWidths,
    zoomScale,
    scaledDefaultRowHeight,
    scaledFontSize,
    effectiveDefaultRowHeight,
    effectiveDefaultFontSize,
    styleCtx,
    dataVersion,
    rowResizeDrag,
    setRowResizeDrag,
    setHoverRowResize,
    patchMeta,
    scheduleMetaSave,
  });

  const isDark = themeMode === 'dark';
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Row 1: Navigation, Search, Marker, Popovers, Settings & About */}
      <EditorToolbar
        toolbarRef={toolbarRef}
        hostMode={hostMode}
        iconSize={appSettings?.toolbarIconSize ?? (hostMode === 'desktop' ? 'large' : 'small')}
        themeMode={themeMode}
        isDark={isDark}
        toolbarBg={toolbarBg}
        toolbarBorder={toolbarBorder}
        toolbarFg={toolbarFg}
        btnStyle={btnStyle}
        menuItemStyle={menuItemStyle}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        activeFormat={activeFormat}
        isReadOnly={isReadOnly}
        dirtyCsv={dirtyCsv}
        csvData={csvData}
        meta={meta}
        rows={rowsRef.current}
        canUndo={historyRef.current.canUndo()}
        canRedo={historyRef.current.canRedo()}
        onNewFile={onNewFile ? handleNewFileAction : undefined}
        onOpenFile={onOpenFile}
        onSaveAs={onSaveAs ? () => void handleSaveAs() : undefined}
        onOpenExportBundle={
          onExportBundle && (filePath || hostMode === 'web')
            ? () => {
                setShowExportModal(true);
                if (historyAdapter?.getStorageUsageBytes) {
                  void historyAdapter
                    .getStorageUsageBytes()
                    .then((b) => setExportHistoryBytes(b))
                    .catch(() => setExportHistoryBytes(null));
                } else {
                  setExportHistoryBytes(null);
                }
              }
            : undefined
        }
        onCloseFile={onCloseFile ? handleCloseFileAction : undefined}
        onSaveCsv={() => void handleSaveCsv()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        fileMenuItems={fileMenuItems}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        matchCount={matches.length}
        activeMatchIdx={activeMatchIdx}
        onPrevMatch={() => setActiveMatchIdx((i) => (i - 1 + matches.length) % matches.length)}
        onNextMatch={() => setActiveMatchIdx((i) => (i + 1) % matches.length)}
        searchHistoryItems={searchHistory.items}
        onPushSearchHistory={(q) => searchHistory.push(q)}
        onRemoveSearchHistory={(q) => searchHistory.remove(q)}
        onClearSearchHistory={() => searchHistory.clear()}
        markers={markers}
        visibleMarkerCount={markedViewRows.length}
        visibleMarkerRowSet={visibleMarkerRowSet}
        selectedDataRow={selectedDataRow}
        selectedMarker={selectedMarker}
        activeMarkerColor={activeMarkerColor}
        onActiveMarkerColorChange={handleMarkerColorChange}
        onlyMarked={onlyMarked}
        onOnlyMarkedChange={setOnlyMarked}
        onToggleSelectedMarker={toggleMarkerOnSelection}
        onJumpPrevMarker={jumpPrevMarker}
        onJumpNextMarker={jumpNextMarker}
        onJumpToDataRow={jumpToDataRow}
        onUpdateMarkerNote={handleUpdateMarkerNote}
        onCycleMarkerColor={handleCycleMarkerColor}
        onRemoveMarker={handleRemoveMarker}
        onClearAllMarkers={handleClearAllMarkers}
        getRowPreview={getRowPreview}
        canTail={canTail && !isMetaTextZipFileName(fileName)}
        showTailPanel={showTailPanel && !isMetaTextZipFileName(fileName)}
        zebraEnabled={zebraEnabled}
        showCellInspector={showCellInspector}
        showHistoryPanel={showHistoryPanel}
        savingSnapshot={savingSnapshot || externalSavingSnapshot}
        onLockReadOnly={() => {
          setOpenMenu('none');
          setIsReadOnly(true);
          patchMeta(['readOnly'], true);
          setStatusMsg('Locked as Read-Only');
        }}
        onUnlockEditing={() => {
          setIsReadOnly(false);
          patchMeta(['readOnly'], false);
          setOpenMenu('none');
          setStatusMsg('Editing unlocked (saved to .metatext.jsonc)');
        }}
        onToggleTailPanel={toggleTailPanel}
        onToggleZebra={() => patchMeta(['table', 'zebraStriping'], !zebraEnabled)}
        onToggleCellInspector={() => setShowCellInspector((s) => !s)}
        onToggleHistoryPanel={handleToggleHistoryPanel}
        onOpenSettings={() => {
          setOpenMenu('none');
          setShowSettingsModal(true);
        }}
        onOpenAbout={() => {
          setOpenMenu('none');
          setShowAboutModal(true);
        }}
        isColumnSelectionMode={isColumnSelectionMode}
        isRowSelectionMode={isRowSelectionMode}
        selection={selection}
        selectedColumnKeys={selectedColumnKeys}
        selectedRowDataIndices={selectedRowDataIndices}
        selectedCellWrap={selectedCellWrap}
        visibleColIndices={visibleColIndices}
        viewRowIndices={viewRowIndices}
        styleCtx={styleCtx}
        defaultHighlightRules={defaultHighlightRules}
        customNumFmt={customNumFmt}
        onCustomNumFmtChange={setCustomNumFmt}
        onApplyStyle={applyStyleToSelection}
        onAutoFitRows={autoFitRows}
        onOpenRulesModal={() => {
          setOpenMenu('none');
          setShowRulesModal(true);
        }}
      />

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

      {/* Main horizontal area: Grid + optional right-side History panel */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      {/* Grid container */}
      <div ref={gridContainerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        {showProgressOverlay && loadingProgress && (
          <LoadingProgressOverlay
            loadingProgress={loadingProgress}
            activeFormat={activeFormat}
            isDark={isDark}
            toolbarFg={toolbarFg}
          />
        )}

        {csvData && (() => {
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
                onHeaderContextMenu={(col, ev) => {
                  setCellContextMenu(null);
                  onHeaderContextMenu(col, ev);
                }}
                onCellContextMenu={handleGridCellContextMenu}
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
              <GridCornerAndHeaderInput
                showRowNums={showRowNums}
                cornerLabel={cornerLabel}
                isAllSelected={isAllSelected}
                rowMarkerWidth={rowMarkerWidth}
                scaledHeaderHeight={scaledHeaderHeight}
                scaledFontSize={scaledFontSize}
                zoomScale={zoomScale}
                isDark={isDark}
                gridTheme={gridTheme}
                toolbarBg={toolbarBg}
                toolbarBorder={toolbarBorder}
                toolbarFg={toolbarFg}
                onToggleSelectAll={() => {
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
                editingHeaderCol={editingHeaderCol}
                onChangeEditingHeaderValue={(value) =>
                  setEditingHeaderCol((prev) => (prev ? { ...prev, value } : null))
                }
                onCommitHeaderTitleEdit={commitHeaderTitleEdit}
                onCancelHeaderTitleEdit={() => setEditingHeaderCol(null)}
              />

              {/* Column Header Right-Click Context Menu */}
              {headerContextMenu && (
                <ColumnContextMenu
                  menuRef={headerMenuRef}
                  menu={headerContextMenu}
                  isDark={isDark}
                  toolbarBorder={toolbarBorder}
                  toolbarFg={toolbarFg}
                  menuItemStyle={menuItemStyle}
                  isReadOnly={isReadOnly}
                  totalColCount={csvData?.columnKeys.length ?? 0}
                  visibleColCount={visibleColIndices.length}
                  adjacentHidden={getAdjacentHiddenColumnKeys(headerContextMenu.visCols)}
                  hasActiveSort={(meta.view?.sort?.length ?? 0) > 0}
                  onClose={() => setHeaderContextMenu(null)}
                  onStartTitleEdit={(firstActual, firstKey, headerBounds) => {
                    const containerRect = gridContainerRef.current?.getBoundingClientRect();
                    const currentTitle =
                      meta.columns?.[firstKey]?.label ?? getDefaultColumnTitle(firstActual);
                    setEditingHeaderCol({
                      actualCol: firstActual,
                      colKey: firstKey,
                      value: currentTitle,
                      left: containerRect
                        ? Math.max(0, headerBounds.x - containerRect.left)
                        : 0,
                      top: containerRect ? Math.max(0, headerBounds.y - containerRect.top) : 0,
                      width: headerBounds.width,
                      height: headerBounds.height,
                    });
                  }}
                  onOpenStyle={(visCols) => {
                    setSelection({
                      columns: CompactSelection.fromSingleSelection([
                        visCols[0]!,
                        visCols[visCols.length - 1]! + 1,
                      ]),
                      rows: CompactSelection.empty(),
                    });
                    setOpenMenu('edit');
                  }}
                  onCopy={(actualCols, colKeys) => void handleCopyColumns(actualCols, colKeys)}
                  onPaste={(firstActual, withStyle) => void handlePasteColumns(firstActual, withStyle)}
                  onDelete={handleDeleteColumns}
                  onHide={handleHideColumns}
                  onUnhide={handleUnhideColumns}
                  onDuplicate={handleDuplicateColumns}
                  onInsertBlank={handleInsertBlankColumns}
                  onShift={handleShiftColumns}
                  onSort={handleSortColumn}
                />
              )}

              {/* Row Header Right-Click Context Menu */}
              {rowContextMenu && (
                <RowContextMenu
                  menuRef={rowMenuRef}
                  menu={rowContextMenu}
                  isDark={isDark}
                  toolbarBorder={toolbarBorder}
                  toolbarFg={toolbarFg}
                  menuItemStyle={menuItemStyle}
                  isReadOnly={isReadOnly}
                  onClose={() => setRowContextMenu(null)}
                  onOpenStyle={(viewRows) => {
                    setSelection({
                      rows: CompactSelection.fromSingleSelection([
                        viewRows[0]!,
                        viewRows[viewRows.length - 1]! + 1,
                      ]),
                      columns: CompactSelection.empty(),
                    });
                    setOpenMenu('edit');
                  }}
                  onCopy={(dataRows) => void handleCopyRows(dataRows)}
                  onPaste={(firstViewRow, withStyle) => void handlePasteRows(firstViewRow, withStyle)}
                  onDelete={handleDeleteRows}
                  onDuplicate={handleDuplicateRows}
                  onInsertBlank={handleInsertBlankRows}
                />
              )}

              {/* Cell Right-Click Context Menu (single & multi-cell selection) */}
              {cellContextMenu && (
                <CellContextMenu
                  menuRef={cellMenuRef}
                  menu={cellContextMenu}
                  isDark={isDark}
                  toolbarBorder={toolbarBorder}
                  toolbarFg={toolbarFg}
                  menuItemStyle={menuItemStyle}
                  isReadOnly={isReadOnly}
                  onClose={() => setCellContextMenu(null)}
                  onOpenStyle={(range) => {
                    setSelection({
                      columns: CompactSelection.empty(),
                      rows: CompactSelection.empty(),
                      current: {
                        cell: [range.x, range.y],
                        range,
                        rangeStack: [],
                      },
                    });
                    setOpenMenu('edit');
                  }}
                  onCopy={(range) => void handleCopyCells(range)}
                  onPaste={(range, withStyle) => void handlePasteCells(range, withStyle)}
                />
              )}
            </>
          );
        })()}

        {/* Excel-like row height resize hit strip over row-number border (drag or double-click to auto-fit) */}
        <RowResizeOverlay
          hoverRowResize={hoverRowResize}
          rowResizeDrag={rowResizeDrag}
          zoomScale={zoomScale}
          explicitRowHeightMap={explicitRowHeightMap}
          visibleColIndices={visibleColIndices}
          onClearHover={() => setHoverRowResize(null)}
          onStartDrag={setRowResizeDrag}
          onAutoFitRow={(dataRow, cols) => autoFitRows([dataRow], cols)}
        />
      </div>

      {/* Optional right-side History panel (exclusive with host Meta JSONC panel) */}
      {showHistoryPanel && (
        <HistorySidePanel
          isDark={isDark}
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          toolbarFg={toolbarFg}
          actionEntries={historyRef.current.getEntries()}
          actionCursor={historyRef.current.getCursor()}
          onJumpToActionCursor={(cursor) => {
            jumpToHistoryCursor(cursor);
          }}
          hasSnapshotBackend={Boolean(historyAdapter && filePath)}
          historyRecordingEnabled={historyPolicy.enabled}
          snapshots={snapshots}
          loadingSnapshots={loadingSnapshots}
          savingSnapshot={savingSnapshot}
          activeSnapshotId={activeSnapshotId}
          storageUsageBytes={storageUsageBytes}
          diffBySnapshotId={diffBySnapshotId}
          loadingDiffId={loadingDiffId}
          onRefreshSnapshots={() => void refreshSnapshots()}
          onRestoreSnapshot={(snap) => void restoreSnapshotToView(snap)}
          onToggleSnapshotDiff={(snap) => void computeSnapshotDiffWithCurrent(snap)}
          onClose={handleToggleHistoryPanel}
        />
      )}
      </div>

      {/* Optional Cell Inspector Drawer (for reading full multiline cells & stack traces) */}
      {showCellInspector && csvData && (
        <CellInspectorDrawer
          isDark={isDark}
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          toolbarFg={toolbarFg}
          btnStyle={btnStyle}
          activeFormat={activeFormat}
          selectedDataRow={selectedDataRow}
          selectedColLabel={selectedColLabel}
          selectedCellValue={selectedCellValue}
          selectedCellLineCount={selectedCellLineCount}
          onCopy={() => {
            void navigator.clipboard?.writeText(selectedCellValue);
            setStatusMsg('Copied cell text');
          }}
          onClose={() => setShowCellInspector(false)}
        />
      )}

      {/* Optional Independent Live Tail Panel */}
      {showTailPanel && canTail && (
        <LiveTailPanel
          isDark={isDark}
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          toolbarFg={toolbarFg}
          btnStyle={btnStyle}
          columns={visibleColIndices.map((actualCol, visIdx) => {
            const col = columns[visIdx];
            const width = col && 'width' in col && typeof col.width === 'number' ? col.width : 140;
            return {
              actualCol,
              title: col?.title ?? getDefaultColumnTitle(actualCol),
              width,
            };
          })}
          showRowNums={showRowNums}
          rowMarkerWidth={rowMarkerWidth}
          scaledFontSize={scaledFontSize}
          scaledRowHeight={scaledDefaultRowHeight}
          scaledHeaderHeight={scaledHeaderHeight}
          lines={tailLines}
          maxLines={tailMaxLines}
          paused={tailPanelPaused}
          tailFollowGrid={tailFollowGrid}
          onChangeMaxLines={setTailMaxLines}
          onTogglePaused={() => setTailPanelPaused((p) => !p)}
          onToggleFollowGrid={toggleTailFollowGrid}
          onClear={clearTailLines}
          onClose={toggleTailPanel}
        />
      )}

      {/* Bottom Status Bar for Desktop & Web (VS Code uses native StatusBarItem) */}
      {hostMode !== 'vscode' && (
        <EditorStatusBar
          isDark={isDark}
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          toolbarFg={toolbarFg}
          fileName={fileName}
          filePath={filePath}
          dirtyCsv={dirtyCsv}
          hasCsvData={Boolean(csvData)}
          activeFormat={activeFormat}
          encoding={csvData?.dialect.encoding}
          lineEnding={csvData?.dialect.lineEnding}
          isReadOnly={isReadOnly}
          invalidLineCount={csvData?.invalidLineCount}
          statusMsg={statusMsg}
          selectedCellLineCount={selectedCellLineCount}
          showCellInspector={showCellInspector}
          onOpenCellInspector={() => setShowCellInspector(true)}
          zoomScale={zoomScale}
          onZoomChange={setZoomScale}
          visibleRowCount={viewRowIndices.length}
          totalRowCount={rowsRef.current.length}
          colCount={csvData?.headers.length ?? 0}
          markerCount={markers.length}
        />
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
        fileSettings={buildFileLayoutSettings({
          csvData,
          activeFormat,
          isReadOnly,
          meta,
          metaTextRef,
          visibleColCount: visibleColIndices.length,
          effectiveDefaultFontSize,
          effectiveDefaultRowHeight,
          getDefaultColumnTitle,
          setIsReadOnly,
          patchMeta,
          scheduleMetaSave,
        })}
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

      {onExportBundle && (
        <ExportBundleModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          isDark={isDark}
          border={toolbarBorder}
          fg={toolbarFg}
          fileName={fileName || 'untitled.csv'}
          dataBytes={fileBytes}
          metaBytes={new TextEncoder().encode(metaTextRef.current ?? '').byteLength}
          historyBytes={exportHistoryBytes}
          hasUnsavedChanges={dirtyCsv}
          onConfirmExport={async (opts) => {
            const res = await onExportBundle(opts);
            if (typeof res === 'string' && res.length > 0) {
              setStatusMsg(`Exported ${res}`);
            } else if (res !== false) {
              setStatusMsg(`Exported ${fileName}.metatext.zip`);
            }
            return res;
          }}
        />
      )}

      {/* Row / Column Delete & Hide Confirmation Dialogs */}
      <EditorConfirmDialogs
        isDark={isDark}
        toolbarBorder={toolbarBorder}
        toolbarFg={toolbarFg}
        btnStyle={btnStyle}
        pendingDeleteRows={pendingDeleteRows}
        onCancelDeleteRows={() => setPendingDeleteRows(null)}
        onConfirmDeleteRows={(target) => {
          setPendingDeleteRows(null);
          executeDeleteRows(target.dataRows, target.label);
        }}
        pendingDeleteCol={pendingDeleteCol}
        onCancelDeleteCol={() => setPendingDeleteCol(null)}
        onConfirmDeleteCol={(target) => {
          setPendingDeleteCol(null);
          executeDeleteColumns(target.actualCols, target.colKeys, target.label);
        }}
        pendingHideCol={pendingHideCol}
        onChangeHideColDontShow={(checked) =>
          setPendingHideCol((prev) => (prev ? { ...prev, dontShowAgain: checked } : null))
        }
        onCancelHideCol={() => setPendingHideCol(null)}
        onConfirmHideCol={(target) => {
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
      />
    </div>
  );
  },
);
