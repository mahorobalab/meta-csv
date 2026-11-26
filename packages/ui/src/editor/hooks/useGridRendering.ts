import { useCallback, useMemo } from 'react';
import {
  CompactSelection,
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
import type { CellStyle, MetaTextDocument, MetaTextFormat, RowMarker } from '@metatext-editor/schema';
import {
  UndoRedoHistory,
  doesCellMatchFilterTerms,
  formatCellValue,
  resolveCellStyle,
  type ParsedCsvData,
  type ParsedFilterTerm,
  type SearchMatch,
} from '@metatext-editor/core';
import { buildGridTheme } from '../../theme';
import { MARKER_PALETTE } from '../../MarkerControls';
import { computeNextCellPosition, type CellMoveDirection } from '../utils/cellNavigationUtils';

export interface UseGridRenderingParams {
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
  themeMode: 'light' | 'dark';
  activeFormat: MetaTextFormat;
  isReadOnly: boolean;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  autoWidths: number[];
  zoomScale: number;
  scaledFontSize: number;
  effectiveDefaultFontSize: number;
  zebraEnabled: boolean;
  dataVersion: number;
  getDefaultColumnTitle: (actualCol: number) => string;
  styleCtx: Parameters<typeof resolveCellStyle>[0] | null;
  markerMap: Map<number, RowMarker>;
  matchSet: Set<string>;
  activeMatch: SearchMatch | undefined;
  filterMatchedRowSet: Set<number> | null;
  filterCollapsedCounts: Map<number, number> | null;
  filterPositiveTerms: ParsedFilterTerm[];
  collapseColKey: string;
  hiddenBeforeVisCols: Set<number>;
  hiddenAfterVisCols: Set<number>;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  rowsRef: React.MutableRefObject<string[][]>;
  historyRef: React.MutableRefObject<UndoRedoHistory>;
  gridRef: React.RefObject<DataEditorRef | null>;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  onDocumentEdit?: (label: string) => void;
}

export function useGridRendering({
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
  filterMatchedRowSet,
  filterCollapsedCounts,
  filterPositiveTerms,
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
}: UseGridRenderingParams) {
  const columns: GridColumn[] = useMemo(() => {
    if (!csvData) return [];
    return visibleColIndices.map((actualColIdx) => {
      const key = csvData.columnKeys[actualColIdx]!;
      const colMeta = meta.columns?.[key];
      const baseTitle = colMeta?.label ?? getDefaultColumnTitle(actualColIdx);
      const baseWidth = colMeta?.width ?? autoWidths[actualColIdx] ?? 140;
      return {
        id: key,
        title: baseTitle,
        width: Math.max(40, Math.round(baseWidth * zoomScale)),
      };
    });
  }, [csvData, visibleColIndices, meta.columns, autoWidths, getDefaultColumnTitle, zoomScale]);

  const gridTheme = useMemo(
    () => buildGridTheme(themeMode, { ...meta.table, fontSize: scaledFontSize }),
    [themeMode, meta.table, scaledFontSize],
  );

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

      const isContextOnlyRow = filterMatchedRowSet !== null && !filterMatchedRowSet.has(dataRow);
      const marker = markerMap.get(dataRow);
      const isFilterHit =
        !isContextOnlyRow &&
        filterPositiveTerms.length > 0 &&
        doesCellMatchFilterTerms(val, actualCol, filterPositiveTerms);
      const collapsedDupes =
        collapseColKey !== '' && colKey === collapseColKey
          ? filterCollapsedCounts?.get(dataRow)
          : undefined;
      const activeNumFmt = resolvedStyle?.numberFormat ?? colMeta?.numberFormat;
      const formattedVal = activeNumFmt ? formatCellValue(val, activeNumFmt) : val;
      const displayVal = collapsedDupes
        ? `${formattedVal} (+${collapsedDupes} dupes)`
        : formattedVal;

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
          ...(isZebraRow ? { bgCell: themeMode === 'dark' ? '#252529' : '#f4f6f9' } : {}),
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
          ...(isFilterHit ? { bgCell: 'rgba(14, 165, 233, 0.20)' } : {}),
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
        (activeFormat === 'log' || activeFormat === 'text' ? (meta.log?.wordWrap ?? false) : false);

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
      rowsRef,
      meta,
      styleCtx,
      markerMap,
      matchSet,
      activeMatch,
      themeMode,
      filterMatchedRowSet,
      filterCollapsedCounts,
      filterPositiveTerms,
      collapseColKey,
      isReadOnly,
      activeFormat,
      effectiveDefaultFontSize,
      zoomScale,
      zebraEnabled,
      dataVersion,
    ],
  );

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
    [
      isReadOnly,
      visibleColIndices,
      viewRowIndices,
      rowsRef,
      historyRef,
      gridRef,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
    ],
  );

  const onFinishedEditing = useCallback(
    (_newValue: GridCell | undefined, movement: Item) => {
      if (!csvData || columns.length === 0 || viewRowIndices.length === 0) return;
      const [movX, movY] = movement;
      if (movX === 0 && movY === 0) return;

      let direction: CellMoveDirection | null = null;
      if (movX > 0) direction = 'tab';
      else if (movX < 0) direction = 'shift-tab';
      else if (movY > 0) direction = 'enter';
      else if (movY < 0) direction = 'shift-enter';
      if (!direction) return;

      const cur = selection.current;
      if (!cur) return;

      const { nextCell, nextRange } = computeNextCellPosition(
        cur.cell,
        cur.range,
        direction,
        columns.length,
        viewRowIndices.length,
      );

      // Apply Excel-like post-edit navigation (preserving multi-cell selection if active)
      window.requestAnimationFrame(() => {
        setSelection({
          columns: CompactSelection.empty(),
          rows: CompactSelection.empty(),
          current: {
            cell: nextCell,
            range: nextRange,
            rangeStack: [],
          },
        });
        gridRef.current?.scrollTo(nextCell[0], nextCell[1], 'both');
        gridRef.current?.focus();
      });
    },
    [csvData, columns.length, viewRowIndices.length, selection.current, setSelection, gridRef],
  );

  return {
    columns,
    gridTheme,
    getCellContent,
    drawCell,
    onCellEdited,
    onFinishedEditing,
  };
}
