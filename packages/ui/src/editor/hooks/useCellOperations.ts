import { useCallback } from 'react';
import {
  CompactSelection,
  type DataEditorRef,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import type { CellStyle, MetaTextDocument } from '@metatext-editor/schema';
import {
  patchMetaJsonc,
  resolveCellStyle,
  type ParsedCsvData,
} from '@metatext-editor/core';
import type { NativeClipboardBridge } from '../../columnClipboard';
import type {
  CellContextMenuState,
  CellRangeRect,
  EditingHeaderColState,
  HeaderContextMenuState,
  RowContextMenuState,
} from '../types';
import {
  readClipboardForCellPaste,
  writeCellsToClipboard,
  type CopiedCellsPayload,
} from '../utils/cellClipboard';
import {
  computeNextCellPosition,
  isCellInsideRange,
  type CellMoveDirection,
} from '../utils/cellNavigationUtils';
import { makeUniqueColumnKey } from '../utils/rowOrderUtils';

export interface UseCellOperationsParams {
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  meta: MetaTextDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  copiedCellsRef: React.MutableRefObject<CopiedCellsPayload | null>;
  isF2EditTriggerRef: React.MutableRefObject<boolean>;
  gridRef: React.RefObject<DataEditorRef | null>;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  isReadOnly: boolean;
  autoWidths: number[];
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  styleCtx: Parameters<typeof resolveCellStyle>[0] | null;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  setOpenMenu: React.Dispatch<React.SetStateAction<'none' | 'file' | 'edit' | 'unlock'>>;
  setHeaderContextMenu: React.Dispatch<React.SetStateAction<HeaderContextMenuState | null>>;
  setRowContextMenu: React.Dispatch<React.SetStateAction<RowContextMenuState | null>>;
  setCellContextMenu: React.Dispatch<React.SetStateAction<CellContextMenuState | null>>;
  setEditingHeaderCol: React.Dispatch<React.SetStateAction<EditingHeaderColState | null>>;
  appendRowsToOrder: (appendedDataRows: number[]) => void;
  scheduleMetaSave: (nextText: string) => void;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  onDocumentEdit?: (label: string) => void;
  nativeClipboard?: NativeClipboardBridge;
}

export function useCellOperations({
  csvData,
  setCsvData,
  meta,
  metaTextRef,
  rowsRef,
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
}: UseCellOperationsParams) {
  const openCellContextMenu = useCallback(
    (
      cell: Item,
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const [visCol, viewRow] = cell;
      if (visCol < 0 || viewRow < 0 || !csvData) return;
      event.preventDefault();

      const curRange = selection.current?.range;
      const keepMulti =
        curRange !== undefined &&
        (curRange.width > 1 || curRange.height > 1) &&
        isCellInsideRange(visCol, viewRow, curRange);

      const targetRange: CellRangeRect = keepMulti
        ? {
            x: curRange.x,
            y: curRange.y,
            width: curRange.width,
            height: curRange.height,
          }
        : { x: visCol, y: viewRow, width: 1, height: 1 };

      setOpenMenu('none');
      setHeaderContextMenu(null);
      setRowContextMenu(null);
      setEditingHeaderCol(null);

      const nextSelection: GridSelection = {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: keepMulti && selection.current ? selection.current.cell : [visCol, viewRow],
          range: targetRange,
          rangeStack: [],
        },
      };
      setSelection(nextSelection);
      window.requestAnimationFrame(() => {
        setSelection(nextSelection);
      });

      const menuW = 248;
      const menuH = 160;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const x = Math.max(8, Math.min(event.bounds.x + 8, vw - menuW - 8));
      const y = Math.max(8, Math.min(event.bounds.y + event.bounds.height + 2, vh - menuH - 8));
      setCellContextMenu({ range: targetRange, x, y });
    },
    [
      csvData,
      selection.current,
      setOpenMenu,
      setHeaderContextMenu,
      setRowContextMenu,
      setEditingHeaderCol,
      setSelection,
      setCellContextMenu,
    ],
  );

  const handleCopyCells = useCallback(
    async (range: CellRangeRect) => {
      if (!csvData || range.width <= 0 || range.height <= 0) return;
      const matrix: string[][] = [];
      const styles: Array<Array<CellStyle | undefined>> = [];

      for (let r = 0; r < range.height; r++) {
        const vr = range.y + r;
        const dr = viewRowIndices[vr];
        const row = dr !== undefined ? rowsRef.current[dr] : undefined;
        const rowVals: string[] = [];
        const rowStyles: Array<CellStyle | undefined> = [];

        for (let c = 0; c < range.width; c++) {
          const vc = range.x + c;
          const ac = visibleColIndices[vc];
          rowVals.push(ac !== undefined ? (row?.[ac] ?? '') : '');

          let cellStyle: CellStyle | undefined;
          if (dr !== undefined && ac !== undefined && row) {
            const colKey = csvData.columnKeys[ac] ?? String(ac);
            const explicitRef = meta.cells?.[`${dr}:${colKey}`];
            const explicitStyle =
              typeof explicitRef === 'string' ? meta.styles?.[explicitRef] : explicitRef;
            cellStyle =
              explicitStyle ??
              (styleCtx ? resolveCellStyle(styleCtx, dr, ac, row) : undefined);
          }
          rowStyles.push(cellStyle);
        }
        matrix.push(rowVals);
        styles.push(rowStyles);
      }

      const payload = await writeCellsToClipboard({ matrix, styles }, nativeClipboard);
      copiedCellsRef.current = payload;
      const cellCount = range.width * range.height;
      setStatusMsg(
        cellCount === 1
          ? 'Copied cell'
          : `Copied ${range.height.toLocaleString()} × ${range.width.toLocaleString()} cells`,
      );
    },
    [
      csvData,
      viewRowIndices,
      visibleColIndices,
      rowsRef,
      meta.cells,
      meta.styles,
      styleCtx,
      nativeClipboard,
      copiedCellsRef,
      setStatusMsg,
    ],
  );

  const handlePasteCells = useCallback(
    async (range: CellRangeRect, withStyle: boolean) => {
      if (!csvData || isReadOnly) return;
      const parsed = await readClipboardForCellPaste(
        withStyle,
        copiedCellsRef.current,
        nativeClipboard,
      );
      if (!parsed || parsed.matrix.length === 0) {
        setStatusMsg('Clipboard is empty');
        return;
      }

      const srcRows = parsed.matrix.length;
      const srcCols = Math.max(1, ...parsed.matrix.map((r) => r.length));
      // Excel-style fill: pasting a single copied cell into a multi-cell selection fills the entire selection
      const isSingleToMulti = srcRows === 1 && srcCols === 1 && (range.width > 1 || range.height > 1);
      const targetHeight = isSingleToMulti ? range.height : srcRows;
      const targetWidth = isSingleToMulti ? range.width : srcCols;

      // Expand columns if paste extends past the rightmost visible column
      const nextHeaders = [...csvData.headers];
      const nextKeys = [...csvData.columnKeys];
      const nextWidths = [...autoWidths];
      let colsExpanded = false;
      const targetActualCols: number[] = [];

      for (let c = 0; c < targetWidth; c++) {
        const vc = range.x + c;
        if (vc < visibleColIndices.length) {
          targetActualCols.push(visibleColIndices[vc]!);
        } else {
          const idx = nextKeys.length;
          const name = csvData.dialect.hasHeader
            ? makeUniqueColumnKey(`column_${idx + 1}`, nextKeys)
            : String(idx);
          nextHeaders.push(csvData.dialect.hasHeader ? name : '');
          nextKeys.push(name);
          nextWidths.push(140);
          colsExpanded = true;
          for (let r = 0; r < rowsRef.current.length; r++) {
            rowsRef.current[r]!.push('');
          }
          targetActualCols.push(idx);
        }
      }

      // Expand rows if paste extends past bottom row
      const targetDataRows: number[] = [];
      const newlyAppendedRows: number[] = [];
      for (let r = 0; r < targetHeight; r++) {
        const vr = range.y + r;
        if (vr < viewRowIndices.length) {
          targetDataRows.push(viewRowIndices[vr]!);
        } else {
          const newRow = Array.from({ length: nextKeys.length }, () => '');
          rowsRef.current.push(newRow);
          const idx = rowsRef.current.length - 1;
          targetDataRows.push(idx);
          newlyAppendedRows.push(idx);
        }
      }
      if (newlyAppendedRows.length > 0) {
        appendRowsToOrder(newlyAppendedRows);
      }

      for (let r = 0; r < targetHeight; r++) {
        const dr = targetDataRows[r]!;
        const dstRow = rowsRef.current[dr];
        if (!dstRow) continue;
        const srcRow = isSingleToMulti ? parsed.matrix[0]! : parsed.matrix[r]!;
        for (let c = 0; c < targetWidth; c++) {
          const ac = targetActualCols[c]!;
          const val = isSingleToMulti ? (srcRow[0] ?? '') : (srcRow[c] ?? '');
          dstRow[ac] = val;
        }
      }

      if (colsExpanded) {
        setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
        setAutoWidths(nextWidths);
      }

      if (withStyle && parsed.styles && parsed.styles.length > 0) {
        let text = metaTextRef.current ?? '';
        let patchedAny = false;
        const maxStyledCells = 500;
        let styledCount = 0;
        for (let r = 0; r < targetHeight && styledCount < maxStyledCells; r++) {
          const dr = targetDataRows[r]!;
          const srcStyleRow = isSingleToMulti ? parsed.styles[0] : parsed.styles[r];
          for (let c = 0; c < targetWidth && styledCount < maxStyledCells; c++) {
            const ac = targetActualCols[c]!;
            const st = isSingleToMulti ? srcStyleRow?.[0] : srcStyleRow?.[c];
            if (st && Object.keys(st).length > 0) {
              const colKey = nextKeys[ac] ?? String(ac);
              text = patchMetaJsonc(text, ['cells', `${dr}:${colKey}`], st);
              patchedAny = true;
              styledCount++;
            }
          }
        }
        if (patchedAny) {
          scheduleMetaSave(text);
        }
      }

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(withStyle ? 'Paste cells with style' : 'Paste cell values');
      setStatusMsg(
        `Pasted ${targetHeight} × ${targetWidth} cell${targetHeight * targetWidth === 1 ? '' : 's'}${
          withStyle ? ' (with style)' : ' (values only)'
        }`,
      );
    },
    [
      csvData,
      isReadOnly,
      copiedCellsRef,
      nativeClipboard,
      autoWidths,
      visibleColIndices,
      viewRowIndices,
      rowsRef,
      appendRowsToOrder,
      setCsvData,
      setAutoWidths,
      metaTextRef,
      scheduleMetaSave,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  const startF2CellEdit = useCallback(() => {
    if (isReadOnly || !csvData || !selection.current) return;
    const [visCol, viewRow] = selection.current.cell;
    const actualCol = visibleColIndices[visCol];
    const colKey = actualCol !== undefined ? csvData.columnKeys[actualCol] : undefined;
    if (colKey && meta.columns?.[colKey]?.readonly) return;

    gridRef.current?.focus();
    const canvas = gridContainerRef.current?.querySelector<HTMLCanvasElement>(
      'canvas[data-testid="data-grid-canvas"]',
    );
    if (!canvas) return;

    isF2EditTriggerRef.current = true;
    try {
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    } finally {
      isF2EditTriggerRef.current = false;
    }

    // Place caret at the end of text (not select-all) like Excel F2 edit mode
    const placeCaretAtEnd = () => {
      const portal = document.getElementById('portal');
      const editorEl = portal?.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea, input',
      );
      if (!editorEl) return false;
      const len = editorEl.value.length;
      editorEl.focus();
      editorEl.setSelectionRange(len, len);
      return true;
    };

    window.requestAnimationFrame(() => {
      if (!placeCaretAtEnd()) {
        window.setTimeout(() => {
          placeCaretAtEnd();
        }, 16);
      }
    });
  }, [
    isReadOnly,
    csvData,
    selection.current,
    visibleColIndices,
    meta.columns,
    gridRef,
    gridContainerRef,
    isF2EditTriggerRef,
  ]);

  const moveSelectionInRange = useCallback(
    (direction: CellMoveDirection) => {
      if (!csvData || !selection.current) return;
      const totalCols = visibleColIndices.length;
      const totalRows = viewRowIndices.length;
      if (totalCols === 0 || totalRows === 0) return;

      const { cell, range } = selection.current;
      const { nextCell, nextRange } = computeNextCellPosition(
        cell,
        range,
        direction,
        totalCols,
        totalRows,
      );

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
    },
    [csvData, selection.current, visibleColIndices.length, viewRowIndices.length, setSelection, gridRef],
  );

  return {
    openCellContextMenu,
    handleCopyCells,
    handlePasteCells,
    startF2CellEdit,
    moveSelectionInRange,
  };
}
