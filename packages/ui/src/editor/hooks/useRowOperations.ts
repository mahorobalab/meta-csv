import { useCallback, useEffect } from 'react';
import {
  CompactSelection,
  type DataEditorRef,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import type { MetaTextDocument, RowMarker } from '@metatext-editor/schema';
import {
  UndoRedoHistory,
  patchMetaJsonc,
  type CellChange,
  type EditCommand,
  type ParsedCsvData,
  type RowSnapshot,
} from '@metatext-editor/core';
import type { MetaSaveOptions } from './useDocumentLoader';
import {
  readClipboardForRowPaste,
  writeRowsToClipboard,
  type CopiedRowsPayload,
  type NativeClipboardBridge,
} from '../../columnClipboard';
import type {
  EditingHeaderColState,
  HeaderContextMenuState,
  PendingDeleteRowsState,
  RowContextMenuState,
} from '../types';
import { isContiguousIndices, makeUniqueColumnKey } from '../utils/rowOrderUtils';

export interface UseRowOperationsParams {
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  meta: MetaTextDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  historyRef: React.MutableRefObject<UndoRedoHistory>;
  copiedRowsRef: React.MutableRefObject<CopiedRowsPayload | null>;
  pendingJumpAfterInsertRef: React.MutableRefObject<{ dataRow: number; count: number } | null>;
  gridRef: React.RefObject<DataEditorRef | null>;
  isReadOnly: boolean;
  autoWidths: number[];
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  viewRowIndices: Int32Array;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  setOpenMenu: React.Dispatch<React.SetStateAction<'none' | 'file' | 'edit' | 'unlock'>>;
  setHeaderContextMenu: React.Dispatch<React.SetStateAction<HeaderContextMenuState | null>>;
  setEditingHeaderCol: React.Dispatch<React.SetStateAction<EditingHeaderColState | null>>;
  setRowContextMenu: React.Dispatch<React.SetStateAction<RowContextMenuState | null>>;
  setPendingDeleteRows: React.Dispatch<React.SetStateAction<PendingDeleteRowsState | null>>;
  markers: RowMarker[];
  persistMarkers: (next: RowMarker[], options?: MetaSaveOptions) => void;
  insertRowsIntoOrder: (insertDataIdx: number, count: number, insertViewPos: number) => void;
  removeRowsFromOrder: (removedDesc: number[]) => void;
  appendRowsToOrder: (appendedDataRows: number[]) => void;
  debouncedFilterQuery: string;
  onlyMarked: boolean;
  scheduleMetaSave: (nextText: string, options?: MetaSaveOptions) => void;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  onDocumentEdit?: (label: string) => void;
  nativeClipboard?: NativeClipboardBridge;
}

export function useRowOperations({
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
}: UseRowOperationsParams) {
  const onCellContextMenu = useCallback(
    (
      cell: Item,
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const [col, viewRow] = cell;
      if (col !== -1 || viewRow < 0 || !csvData) return;
      event.preventDefault();

      const selectedViewRows = selection.rows.toArray();
      const keepMulti =
        selectedViewRows.length > 1 &&
        isContiguousIndices(selectedViewRows) &&
        selectedViewRows.includes(viewRow);

      const targetViewRows = keepMulti ? selectedViewRows : [viewRow];
      const targetDataRows: number[] = [];
      for (const vr of targetViewRows) {
        const dr = viewRowIndices[vr];
        if (dr !== undefined) targetDataRows.push(dr);
      }
      if (targetDataRows.length === 0) return;

      setOpenMenu('none');
      setHeaderContextMenu(null);
      setEditingHeaderCol(null);

      const nextRowSelection: GridSelection = {
        rows: CompactSelection.fromSingleSelection([
          targetViewRows[0]!,
          targetViewRows[targetViewRows.length - 1]! + 1,
        ]),
        columns: CompactSelection.empty(),
      };
      setSelection(nextRowSelection);
      window.requestAnimationFrame(() => {
        setSelection(nextRowSelection);
      });

      const menuW = 262;
      const menuH = 310;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const x = Math.max(8, Math.min(event.bounds.x + event.bounds.width + 2, vw - menuW - 8));
      const y = Math.max(8, Math.min(event.bounds.y, vh - menuH - 8));
      setRowContextMenu({
        viewRows: targetViewRows,
        dataRows: targetDataRows,
        x,
        y,
      });
    },
    [
      csvData,
      selection.rows,
      viewRowIndices,
      setOpenMenu,
      setHeaderContextMenu,
      setEditingHeaderCol,
      setSelection,
      setRowContextMenu,
    ],
  );

  const handleCopyRows = useCallback(
    async (dataRows: number[]) => {
      if (!csvData || dataRows.length === 0) return;
      const matrix: string[][] = dataRows.map((dr) => {
        const row = rowsRef.current[dr];
        return csvData.columnKeys.map((_, cIdx) => row?.[cIdx] ?? '');
      });
      const rowStyles = dataRows.map((dr) => {
        const ref = meta.rows?.[String(dr)]?.style;
        return typeof ref === 'string' ? meta.styles?.[ref] : ref;
      });
      const payload = await writeRowsToClipboard({ matrix, rowStyles }, nativeClipboard);
      copiedRowsRef.current = payload;
      setStatusMsg(
        `Copied ${dataRows.length.toLocaleString()} row${dataRows.length === 1 ? '' : 's'}`,
      );
    },
    [csvData, meta.rows, meta.styles, rowsRef, copiedRowsRef, nativeClipboard, setStatusMsg],
  );

  const handlePasteRows = useCallback(
    async (startViewRow: number, withStyle: boolean) => {
      if (!csvData || isReadOnly) return;
      const parsed = await readClipboardForRowPaste(
        withStyle,
        copiedRowsRef.current,
        nativeClipboard,
      );
      if (!parsed || parsed.matrix.length === 0) {
        setStatusMsg('Clipboard is empty');
        return;
      }

      const prevMetaText = metaTextRef.current ?? '';
      const steps: EditCommand[] = [];
      const prevColCount = csvData.columnKeys.length;
      const prevRowCount = rowsRef.current.length;

      const maxCols = Math.max(prevColCount, ...parsed.matrix.map((r) => r.length));
      const nextHeaders = [...csvData.headers];
      const nextKeys = [...csvData.columnKeys];
      const nextWidths = [...autoWidths];
      const addedHeaders: string[] = [];
      const addedKeys: string[] = [];
      const addedWidths: number[] = [];
      let colsExpanded = false;
      while (nextKeys.length < maxCols) {
        const idx = nextKeys.length;
        const name = csvData.dialect.hasHeader
          ? makeUniqueColumnKey(`column_${idx + 1}`, nextKeys)
          : String(idx);
        const h = csvData.dialect.hasHeader ? name : '';
        nextHeaders.push(h);
        nextKeys.push(name);
        nextWidths.push(140);
        addedHeaders.push(h);
        addedKeys.push(name);
        addedWidths.push(140);
        colsExpanded = true;
        for (let r = 0; r < rowsRef.current.length; r++) {
          rowsRef.current[r]!.push('');
        }
      }
      if (colsExpanded) {
        steps.push({
          type: 'insertCols',
          index: prevColCount,
          headers: addedHeaders,
          keys: addedKeys,
          widths: addedWidths,
          reindexKeys: !csvData.dialect.hasHeader,
        });
      }

      const targetDataRows: number[] = [];
      const newlyAppendedRows: number[] = [];
      const appendedRowCopies: string[][] = [];
      for (let i = 0; i < parsed.matrix.length; i++) {
        const vr = startViewRow + i;
        if (vr < viewRowIndices.length) {
          targetDataRows.push(viewRowIndices[vr]!);
        } else {
          const newRow = Array.from({ length: nextKeys.length }, () => '');
          rowsRef.current.push(newRow);
          const idx = rowsRef.current.length - 1;
          targetDataRows.push(idx);
          newlyAppendedRows.push(idx);
          appendedRowCopies.push([...newRow]);
        }
      }
      if (newlyAppendedRows.length > 0) {
        appendRowsToOrder(newlyAppendedRows);
        steps.push({
          type: 'insertRows',
          index: prevRowCount,
          rows: appendedRowCopies,
        });
      }

      const cellChanges: CellChange[] = [];
      for (let i = 0; i < parsed.matrix.length; i++) {
        const dr = targetDataRows[i]!;
        const dst = rowsRef.current[dr];
        if (!dst) continue;
        const src = parsed.matrix[i]!;
        for (let c = 0; c < nextKeys.length; c++) {
          const before = dst[c] ?? '';
          const after = c < src.length ? (src[c] ?? '') : '';
          if (before !== after) {
            dst[c] = after;
            cellChanges.push({ dataRow: dr, col: c, before, after });
          }
        }
      }
      if (cellChanges.length > 0) {
        steps.push({ type: 'editCells', changes: cellChanges });
      }

      if (colsExpanded) {
        setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
        setAutoWidths(nextWidths);
      }

      if (withStyle && parsed.rowStyles && parsed.rowStyles.length > 0) {
        let text = prevMetaText;
        let patchedAny = false;
        for (let i = 0; i < Math.min(targetDataRows.length, 500); i++) {
          const st = parsed.rowStyles[i];
          if (st && Object.keys(st).length > 0) {
            text = patchMetaJsonc(text, ['rows', String(targetDataRows[i]!), 'style'], st);
            patchedAny = true;
          }
        }
        if (patchedAny) {
          scheduleMetaSave(text, { skipHistory: true });
          if (text !== prevMetaText) {
            steps.push({ type: 'metaChange', beforeMetaText: prevMetaText, afterMetaText: text });
          }
        }
      }

      if (steps.length > 0) {
        const cmd: EditCommand =
          steps.length === 1 ? steps[0]! : { type: 'composite', steps };
        historyRef.current.push(
          cmd,
          withStyle
            ? `Paste ${parsed.matrix.length} row(s) with style`
            : `Paste ${parsed.matrix.length} row(s)`,
        );
      }

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(withStyle ? 'Paste row(s) with style' : 'Paste row values');
      setStatusMsg(
        `Pasted ${parsed.matrix.length.toLocaleString()} row${parsed.matrix.length === 1 ? '' : 's'}${
          withStyle ? ' (with style)' : ' (values only)'
        }`,
      );
    },
    [
      csvData,
      isReadOnly,
      copiedRowsRef,
      nativeClipboard,
      autoWidths,
      rowsRef,
      historyRef,
      viewRowIndices,
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

  const executeDeleteRows = useCallback(
    (dataRows: number[], label: string) => {
      if (!csvData || isReadOnly || dataRows.length === 0) return;
      const prevMetaText = metaTextRef.current ?? '';
      const uniqueAsc = Array.from(new Set(dataRows)).sort((a, b) => a - b);
      const uniqueDesc = [...uniqueAsc].reverse();
      const deletedSnapshots: RowSnapshot[] = uniqueAsc
        .filter((dr) => dr >= 0 && dr < rowsRef.current.length)
        .map((dr) => ({ index: dr, row: [...(rowsRef.current[dr] ?? [])] }));
      const removedSet = new Set(uniqueDesc);
      for (const dr of uniqueDesc) {
        rowsRef.current.splice(dr, 1);
      }
      removeRowsFromOrder(uniqueDesc);
      const steps: EditCommand[] = [{ type: 'deleteRows', rows: deletedSnapshots }];
      if (markers.length > 0) {
        const nextMarkers = markers
          .filter((m) => !removedSet.has(m.row))
          .map((m) => {
            let shift = 0;
            for (const dr of uniqueDesc) {
              if (dr < m.row) shift++;
            }
            return shift > 0 ? { ...m, row: m.row - shift } : m;
          });
        persistMarkers(nextMarkers, { skipHistory: true });
        const afterMetaText = metaTextRef.current ?? '';
        if (afterMetaText !== prevMetaText) {
          steps.push({ type: 'metaChange', beforeMetaText: prevMetaText, afterMetaText });
        }
      }
      historyRef.current.push(
        steps.length === 1 ? steps[0]! : { type: 'composite', steps },
        uniqueDesc.length > 1 ? `Delete ${uniqueDesc.length} rows` : 'Delete row',
      );
      setSelection({
        rows: CompactSelection.empty(),
        columns: CompactSelection.empty(),
      });
      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(uniqueDesc.length > 1 ? 'Delete rows' : 'Delete row');
      setStatusMsg(`Deleted ${label}`);
    },
    [
      csvData,
      isReadOnly,
      metaTextRef,
      rowsRef,
      historyRef,
      removeRowsFromOrder,
      markers,
      persistMarkers,
      setSelection,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  const handleDeleteRows = useCallback(
    (dataRows: number[]) => {
      if (!csvData || isReadOnly || dataRows.length === 0) return;
      const label =
        dataRows.length === 1
          ? `行 #${dataRows[0]! + 1}`
          : `選択中の ${dataRows.length} 行`;
      setPendingDeleteRows({ dataRows, label });
    },
    [csvData, isReadOnly, setPendingDeleteRows],
  );

  const handleDuplicateRows = useCallback(
    (viewRows: number[], dataRows: number[], side: 'above' | 'below') => {
      if (!csvData || isReadOnly || dataRows.length === 0) return;
      const prevMetaText = metaTextRef.current ?? '';
      const firstViewPos = viewRows.length > 0 ? Math.min(...viewRows) : 0;
      const lastViewPos = viewRows.length > 0 ? Math.max(...viewRows) : 0;
      const anchorDataRow =
        side === 'above'
          ? (viewRowIndices[firstViewPos] ?? dataRows[0]!)
          : (viewRowIndices[lastViewPos] ?? dataRows[dataRows.length - 1]!);
      const insertIdx = side === 'above' ? anchorDataRow : anchorDataRow + 1;
      const insertViewPos = side === 'above' ? firstViewPos : lastViewPos + 1;

      const copies = dataRows.map((dr) => [...(rowsRef.current[dr] ?? [])]);
      rowsRef.current.splice(insertIdx, 0, ...copies);
      insertRowsIntoOrder(insertIdx, copies.length, insertViewPos);

      const steps: EditCommand[] = [
        { type: 'insertRows', index: insertIdx, rows: copies.map((r) => [...r]) },
      ];
      if (markers.length > 0 && markers.some((m) => m.row >= insertIdx)) {
        persistMarkers(
          markers.map((m) => (m.row >= insertIdx ? { ...m, row: m.row + copies.length } : m)),
          { skipHistory: true },
        );
        const afterMetaText = metaTextRef.current ?? '';
        if (afterMetaText !== prevMetaText) {
          steps.push({ type: 'metaChange', beforeMetaText: prevMetaText, afterMetaText });
        }
      }
      historyRef.current.push(
        steps.length === 1 ? steps[0]! : { type: 'composite', steps },
        `Duplicate ${copies.length} row${copies.length === 1 ? '' : 's'} ${side}`,
      );

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(`Duplicate ${copies.length} row(s) ${side}`);
      setStatusMsg(`Duplicated ${copies.length} row${copies.length === 1 ? '' : 's'} ${side}`);
    },
    [
      csvData,
      isReadOnly,
      metaTextRef,
      viewRowIndices,
      rowsRef,
      historyRef,
      insertRowsIntoOrder,
      markers,
      persistMarkers,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  const handleInsertBlankRows = useCallback(
    (viewRows: number[], dataRows: number[], side: 'above' | 'below') => {
      if (!csvData || isReadOnly || dataRows.length === 0) return;
      const prevMetaText = metaTextRef.current ?? '';
      const count = dataRows.length;
      const firstViewPos = viewRows.length > 0 ? Math.min(...viewRows) : 0;
      const lastViewPos = viewRows.length > 0 ? Math.max(...viewRows) : 0;
      const anchorDataRow =
        side === 'above'
          ? (viewRowIndices[firstViewPos] ?? dataRows[0]!)
          : (viewRowIndices[lastViewPos] ?? dataRows[dataRows.length - 1]!);
      const insertIdx = side === 'above' ? anchorDataRow : anchorDataRow + 1;
      const insertViewPos = side === 'above' ? firstViewPos : lastViewPos + 1;

      const colCount = csvData.columnKeys.length;
      const blanks = Array.from({ length: count }, () =>
        Array.from({ length: colCount }, () => ''),
      );
      rowsRef.current.splice(insertIdx, 0, ...blanks);
      insertRowsIntoOrder(insertIdx, count, insertViewPos);

      const steps: EditCommand[] = [
        { type: 'insertRows', index: insertIdx, rows: blanks.map((r) => [...r]) },
      ];
      if (markers.length > 0 && markers.some((m) => m.row >= insertIdx)) {
        persistMarkers(
          markers.map((m) => (m.row >= insertIdx ? { ...m, row: m.row + count } : m)),
          { skipHistory: true },
        );
        const afterMetaText = metaTextRef.current ?? '';
        if (afterMetaText !== prevMetaText) {
          steps.push({ type: 'metaChange', beforeMetaText: prevMetaText, afterMetaText });
        }
      }
      historyRef.current.push(
        steps.length === 1 ? steps[0]! : { type: 'composite', steps },
        `Insert ${count} blank row${count === 1 ? '' : 's'} ${side}`,
      );

      const hasActiveFilter = debouncedFilterQuery.trim().length > 0 || onlyMarked;
      pendingJumpAfterInsertRef.current = { dataRow: insertIdx, count };

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(`Insert ${count} blank row(s) ${side}`);
      setStatusMsg(
        hasActiveFilter
          ? `Inserted ${count} blank row${count === 1 ? '' : 's'} (may be hidden by active filter)`
          : `Inserted ${count} blank row${count === 1 ? '' : 's'} ${side}`,
      );
    },
    [
      csvData,
      isReadOnly,
      metaTextRef,
      viewRowIndices,
      rowsRef,
      historyRef,
      insertRowsIntoOrder,
      markers,
      persistMarkers,
      debouncedFilterQuery,
      onlyMarked,
      pendingJumpAfterInsertRef,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  useEffect(() => {
    const pending = pendingJumpAfterInsertRef.current;
    if (!pending) return;
    pendingJumpAfterInsertRef.current = null;
    const vr = viewRowIndices.indexOf(pending.dataRow);
    if (vr === -1) return;
    const endVr = Math.min(viewRowIndices.length, vr + pending.count);
    setSelection({
      rows: CompactSelection.fromSingleSelection([vr, endVr]),
      columns: CompactSelection.empty(),
    });
    window.requestAnimationFrame(() => {
      gridRef.current?.scrollTo(0, vr, 'vertical', 0, 0, { vAlign: 'center' });
    });
  }, [viewRowIndices, pendingJumpAfterInsertRef, setSelection, gridRef]);

  return {
    onCellContextMenu,
    handleCopyRows,
    handlePasteRows,
    executeDeleteRows,
    handleDeleteRows,
    handleDuplicateRows,
    handleInsertBlankRows,
  };
}
