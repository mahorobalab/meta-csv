import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MetaTextDocument, MetaTextFormat } from '@metatext-editor/schema';
import {
  applyViewFilter,
  buildDefaultHighlightRules,
  buildSortedRowIndices,
  createStyleResolverContext,
  indexToExcelColumn,
  type ParsedCsvData,
  type ParsedFilterTerm,
} from '@metatext-editor/core';
import type { FilterColumnOption } from '../../FilterBar';
import {
  appendRowsToOrderArray,
  insertRowsIntoOrderArray,
  removeRowsFromOrderArray,
} from '../utils/rowOrderUtils';

export interface UseEditorViewPipelineParams {
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
  activeFormat: MetaTextFormat;
  themeMode: 'light' | 'dark';
  noHeaderColumnStyle?: 'excel' | 'numbered';
  rowsRef: React.MutableRefObject<string[][]>;
  filterQuery: string;
  debouncedFilterQuery: string;
  setDebouncedFilterQuery: (q: string) => void;
  filterContextRows: number;
  collapseColKey: string;
}

export function useEditorViewPipeline({
  csvData,
  meta,
  activeFormat,
  themeMode,
  noHeaderColumnStyle,
  rowsRef,
  filterQuery,
  debouncedFilterQuery,
  setDebouncedFilterQuery,
  filterContextRows,
  collapseColKey,
}: UseEditorViewPipelineParams) {
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

  const { hiddenBeforeVisCols, hiddenAfterVisCols } = useMemo(() => {
    const before = new Set<number>();
    const after = new Set<number>();
    if (!csvData || visibleColIndices.length === 0) {
      return { hiddenBeforeVisCols: before, hiddenAfterVisCols: after };
    }
    if (visibleColIndices[0]! > 0) before.add(0);
    for (let i = 1; i < visibleColIndices.length; i++) {
      if (visibleColIndices[i]! - visibleColIndices[i - 1]! > 1) before.add(i);
    }
    if (visibleColIndices[visibleColIndices.length - 1]! < csvData.columnKeys.length - 1) {
      after.add(visibleColIndices.length - 1);
    }
    return { hiddenBeforeVisCols: before, hiddenAfterVisCols: after };
  }, [csvData, visibleColIndices]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedFilterQuery(filterQuery);
    }, 220);
    return () => window.clearTimeout(t);
  }, [filterQuery, setDebouncedFilterQuery]);

  const getDefaultColumnTitle = useCallback(
    (idx: number): string => {
      if (!csvData) return `column ${idx + 1}`;
      if (csvData.dialect.hasHeader) {
        return csvData.headers[idx] ?? `column ${idx + 1}`;
      }
      return noHeaderColumnStyle === 'numbered' ? `column ${idx + 1}` : indexToExcelColumn(idx);
    },
    [csvData, noHeaderColumnStyle],
  );

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

  const [orderedRowIndices, setOrderedRowIndices] = useState<Int32Array>(() => new Int32Array(0));
  const [sortApplyTick, setSortApplyTick] = useState(0);
  const sortSpecKey = useMemo(() => JSON.stringify(meta.view?.sort ?? null), [meta.view?.sort]);

  useEffect(() => {
    if (!csvData) {
      setOrderedRowIndices(new Int32Array(0));
      return;
    }
    setOrderedRowIndices(
      buildSortedRowIndices(rowsRef.current, csvData.columnKeys, meta.view?.sort),
    );
  }, [csvData?.rows, sortSpecKey, sortApplyTick]);

  const insertRowsIntoOrder = useCallback(
    (insertDataIdx: number, count: number, insertViewPos: number) => {
      setOrderedRowIndices((prev) =>
        insertRowsIntoOrderArray(prev, insertDataIdx, count, insertViewPos),
      );
    },
    [],
  );

  const removeRowsFromOrder = useCallback((removedDesc: number[]) => {
    setOrderedRowIndices((prev) => removeRowsFromOrderArray(prev, removedDesc));
  }, []);

  const appendRowsToOrder = useCallback((appendedDataRows: number[]) => {
    if (appendedDataRows.length === 0) return;
    setOrderedRowIndices((prev) => appendRowsToOrderArray(prev, appendedDataRows));
  }, []);

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
        indices: orderedRowIndices,
        matchedRowSet: null,
        matchedCount: orderedRowIndices.length,
        collapsedCounts: null,
        positiveTerms: [] as ParsedFilterTerm[],
        error: undefined,
        elapsedMs: 0,
      };
    }
    const t0 = performance.now();
    const res = applyViewFilter(rowsRef.current, orderedRowIndices, {
      query: debouncedFilterQuery,
      contextRows: filterContextRows,
      collapseColIndex: collapseIdx,
      columnLookup: filterColumnLookup,
    });
    return { ...res, elapsedMs: Math.round(performance.now() - t0) };
  }, [
    csvData,
    orderedRowIndices,
    debouncedFilterQuery,
    filterContextRows,
    collapseColKey,
    filterColumnLookup,
    rowsRef,
  ]);

  const defaultHighlightRules = useMemo(() => {
    if (!csvData || meta.rules !== undefined) return [];
    return buildDefaultHighlightRules(csvData.columnKeys, {
      format: activeFormat,
      levelColumn: meta.log?.levelColumn ?? csvData.logOptions?.levelColumn,
      themeMode,
    });
  }, [csvData, meta.rules, meta.log?.levelColumn, activeFormat, themeMode]);

  const styleCtx = useMemo(() => {
    if (!csvData) return null;
    const effectiveMeta =
      meta.rules === undefined && defaultHighlightRules.length > 0
        ? { ...meta, rules: defaultHighlightRules }
        : meta;
    return createStyleResolverContext(effectiveMeta, csvData.columnKeys);
  }, [csvData, meta, defaultHighlightRules]);

  return {
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
  };
}
