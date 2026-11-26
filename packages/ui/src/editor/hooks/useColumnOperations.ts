import { useCallback } from 'react';
import { CompactSelection, type GridSelection } from '@glideapps/glide-data-grid';
import type { MetaTextDocument, MetaTextFormat } from '@metatext-editor/schema';
import { patchMetaJsonc, type ParsedCsvData } from '@metatext-editor/core';
import type { CopiedColumnPayload, NativeClipboardBridge } from '../../columnClipboard';
import type {
  EditingHeaderColState,
  HeaderContextMenuState,
  PendingDeleteColState,
  PendingHideColState,
} from '../types';
import {
  isContiguousIndices,
  makeUniqueColumnKey,
  rotateArrayBlock,
} from '../utils/rowOrderUtils';
import { useColumnClipboard } from './useColumnClipboard';

export interface UseColumnOperationsParams {
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  meta: MetaTextDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  copiedColumnRef: React.MutableRefObject<CopiedColumnPayload | null>;
  isReadOnly: boolean;
  activeFormat: MetaTextFormat;
  autoWidths: number[];
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  editingHeaderCol: EditingHeaderColState | null;
  setEditingHeaderCol: React.Dispatch<React.SetStateAction<EditingHeaderColState | null>>;
  setHeaderContextMenu: React.Dispatch<React.SetStateAction<HeaderContextMenuState | null>>;
  setOpenMenu: React.Dispatch<React.SetStateAction<'none' | 'file' | 'edit' | 'unlock'>>;
  setPendingDeleteCol: React.Dispatch<React.SetStateAction<PendingDeleteColState | null>>;
  setPendingHideCol: React.Dispatch<React.SetStateAction<PendingHideColState | null>>;
  shouldConfirmHideColumn: boolean;
  getDefaultColumnTitle: (actualCol: number) => string;
  appendRowsToOrder: (appendedDataRows: number[]) => void;
  patchMeta: (path: (string | number)[], value: unknown) => void;
  scheduleMetaSave: (nextText: string) => void;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  onDocumentEdit?: (label: string) => void;
  nativeClipboard?: NativeClipboardBridge;
}

export function useColumnOperations({
  csvData,
  setCsvData,
  meta,
  metaTextRef,
  rowsRef,
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
}: UseColumnOperationsParams) {
  const onHeaderContextMenu = useCallback(
    (
      colIndex: number,
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      if (!csvData) return;
      event.preventDefault();

      const selectedVisCols = selection.columns.toArray();
      const keepMulti =
        selectedVisCols.length > 1 &&
        isContiguousIndices(selectedVisCols) &&
        selectedVisCols.includes(colIndex);

      const targetVisCols = keepMulti ? selectedVisCols : [colIndex];
      const targetActualCols: number[] = [];
      const targetColKeys: string[] = [];
      for (const vc of targetVisCols) {
        const ac = visibleColIndices[vc];
        if (ac !== undefined) {
          targetActualCols.push(ac);
          targetColKeys.push(csvData.columnKeys[ac] ?? String(ac));
        }
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
    [
      csvData,
      selection.columns,
      visibleColIndices,
      setOpenMenu,
      setEditingHeaderCol,
      setSelection,
      setHeaderContextMenu,
    ],
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
      const uniqueKey = makeUniqueColumnKey(trimmed, otherKeys);
      nextHeaders[actualCol] = trimmed;
      nextKeys[actualCol] = uniqueKey;

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
      patchMeta(['columns', colKey, 'label'], trimmed.length > 0 ? trimmed : undefined);
      setStatusMsg(trimmed ? `Updated column label to "${trimmed}"` : 'Reset column label');
    }
  }, [
    editingHeaderCol,
    csvData,
    isReadOnly,
    activeFormat,
    meta.columns,
    metaTextRef,
    scheduleMetaSave,
    setCsvData,
    setDirtyCsv,
    setDataVersion,
    onDocumentEdit,
    setStatusMsg,
    patchMeta,
    setEditingHeaderCol,
  ]);

  const { handleCopyColumns, handlePasteColumns } = useColumnClipboard({
    csvData,
    setCsvData,
    meta,
    metaTextRef,
    rowsRef,
    copiedColumnRef,
    isReadOnly,
    autoWidths,
    setAutoWidths,
    viewRowIndices,
    getDefaultColumnTitle,
    appendRowsToOrder,
    scheduleMetaSave,
    setDirtyCsv,
    setDataVersion,
    setStatusMsg,
    onDocumentEdit,
    nativeClipboard,
  });

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
    [
      csvData,
      isReadOnly,
      autoWidths,
      rowsRef,
      meta.columns,
      metaTextRef,
      scheduleMetaSave,
      setCsvData,
      setAutoWidths,
      setSelection,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
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
    [csvData, isReadOnly, meta.columns, getDefaultColumnTitle, setPendingDeleteCol, setStatusMsg],
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
    [visibleColIndices.length, metaTextRef, scheduleMetaSave, setSelection, setStatusMsg],
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
      setPendingHideCol,
      executeHideColumns,
      setStatusMsg,
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
    [metaTextRef, scheduleMetaSave, setStatusMsg],
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
      const metaCopies: Array<{ newKey: string; cfg: NonNullable<typeof meta.columns>[string] }> =
        [];

      for (let i = 0; i < actualCols.length; i++) {
        const ac = actualCols[i]!;
        const oldKey = colKeys[i]!;
        const baseHeader = csvData.headers[ac] ?? `column_${ac + 1}`;
        const newHeader = csvData.dialect.hasHeader
          ? makeUniqueColumnKey(`${baseHeader}_copy`, workingKeys)
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
        : Array.from({ length: csvData.columnKeys.length + actualCols.length }, (_, i) =>
            String(i),
          );

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
    [
      csvData,
      isReadOnly,
      autoWidths,
      meta.columns,
      rowsRef,
      metaTextRef,
      scheduleMetaSave,
      setCsvData,
      setAutoWidths,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
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
          ? makeUniqueColumnKey(`column_${workingKeys.length + 1}`, workingKeys)
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
      setStatusMsg(`Inserted ${count} blank column${count === 1 ? '' : 's'} to the ${side}`);
    },
    [
      csvData,
      isReadOnly,
      autoWidths,
      rowsRef,
      setCsvData,
      setAutoWidths,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  const handleShiftColumns = useCallback(
    (visCols: number[], actualCols: number[], direction: -1 | 1) => {
      if (!csvData || isReadOnly || actualCols.length === 0) return;
      const startCol = actualCols[0]!;
      const endCol = actualCols[actualCols.length - 1]!;
      const totalCols = csvData.columnKeys.length;
      if (direction === -1 && startCol <= 0) return;
      if (direction === 1 && endCol >= totalCols - 1) return;

      const nextHeaders = rotateArrayBlock(csvData.headers, startCol, endCol, direction);
      const nextKeys = csvData.dialect.hasHeader
        ? rotateArrayBlock(csvData.columnKeys, startCol, endCol, direction)
        : [...csvData.columnKeys];
      const nextWidths = rotateArrayBlock(
        Array.from({ length: totalCols }, (_, i) => autoWidths[i] ?? 140),
        startCol,
        endCol,
        direction,
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

      if (!csvData.dialect.hasHeader && meta.columns) {
        const oldConfigs = Array.from({ length: totalCols }, (_, i) => meta.columns?.[String(i)]);
        const rotatedConfigs = rotateArrayBlock(oldConfigs, startCol, endCol, direction);
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
      rowsRef,
      meta.columns,
      metaTextRef,
      scheduleMetaSave,
      setCsvData,
      setAutoWidths,
      visibleColIndices.length,
      setSelection,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  return {
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
  };
}
