import { useCallback, useMemo } from 'react';
import type { GridSelection } from '@glideapps/glide-data-grid';
import type { CellStyle, MetaCsvDocument, RangeStyleRule } from '@meta-csv/schema';
import { patchMetaJsonc, type ParsedCsvData } from '@meta-csv/core';

export interface UseStyleActionsParams {
  csvData: ParsedCsvData | null;
  meta: MetaCsvDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  selection: GridSelection;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  patchMeta: (path: (string | number)[], value: unknown) => void;
  scheduleMetaSave: (nextText: string) => void;
}

export function useStyleActions({
  csvData,
  meta,
  metaTextRef,
  selection,
  visibleColIndices,
  viewRowIndices,
  patchMeta,
  scheduleMetaSave,
}: UseStyleActionsParams) {
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

  const selectedRowDataIndices = useMemo(() => {
    if (!csvData || isColumnSelectionMode || selection.rows.length === 0) return [] as number[];
    const list: number[] = [];
    for (const vr of selection.rows.toArray()) {
      const dr = viewRowIndices[vr];
      if (dr !== undefined) list.push(dr);
      if (list.length >= 500) break;
    }
    return list;
  }, [csvData, isColumnSelectionMode, selection.rows, viewRowIndices]);

  const isRowSelectionMode = selectedRowDataIndices.length > 0 && !isColumnSelectionMode;

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

      if (selectedRowDataIndices.length > 0) {
        let text = metaTextRef.current ?? '';
        for (const dr of selectedRowDataIndices) {
          const rowKey = String(dr);
          if (isClearAll) {
            text = patchMetaJsonc(text, ['rows', rowKey, 'style'], undefined);
            continue;
          }
          const existingRef = meta.rows?.[rowKey]?.style;
          const existing: CellStyle =
            typeof existingRef === 'string'
              ? { ...(meta.styles?.[existingRef] ?? {}) }
              : { ...(existingRef ?? {}) };
          const next = updater(existing);
          const hasAny = Object.values(next).some((v) => v !== undefined);
          text = patchMetaJsonc(text, ['rows', rowKey, 'style'], hasAny ? next : undefined);
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
      selectedRowDataIndices,
      selection,
      visibleColIndices,
      viewRowIndices,
      meta,
      metaTextRef,
      patchMeta,
      scheduleMetaSave,
    ],
  );

  return {
    selectedColumnKeys,
    isColumnSelectionMode,
    selectedRowDataIndices,
    isRowSelectionMode,
    applyStyleToSelection,
  };
}
