import { useEffect, useMemo, useState } from 'react';
import type { DataEditorRef, GridSelection } from '@glideapps/glide-data-grid';
import type { MetaCsvDocument, MetaTextFormat } from '@meta-csv/schema';
import {
  resolveCellStyle,
  searchVisibleRows,
  type ParsedCsvData,
  type SearchMatch,
} from '@meta-csv/core';
import type { EditorStatusInfo } from '../types';

export interface UseEditorSearchAndStatusParams {
  csvData: ParsedCsvData | null;
  meta: MetaCsvDocument;
  activeFormat: MetaTextFormat;
  isReadOnly: boolean;
  fileName: string;
  dirtyCsv: boolean;
  fileBytes: number;
  markerCount: number;
  dataVersion: number;
  searchQuery: string;
  viewRowIndices: Int32Array;
  visibleColIndices: number[];
  selection: GridSelection;
  selectedDataRow: number | undefined;
  styleCtx: Parameters<typeof resolveCellStyle>[0] | null;
  getDefaultColumnTitle: (idx: number) => string;
  rowsRef: React.MutableRefObject<string[][]>;
  gridRef: React.RefObject<DataEditorRef | null>;
  onStatusChange?: (info: EditorStatusInfo) => void;
}

export function useEditorSearchAndStatus({
  csvData,
  meta,
  activeFormat,
  isReadOnly,
  fileName,
  dirtyCsv,
  fileBytes,
  markerCount,
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
}: UseEditorSearchAndStatusParams) {
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  useEffect(() => {
    if (!searchQuery.trim() || !csvData) {
      setMatches([]);
      setActiveMatchIdx(0);
      return;
    }
    const found = searchVisibleRows(rowsRef.current, viewRowIndices, searchQuery);
    setMatches(found);
    setActiveMatchIdx(0);
  }, [searchQuery, viewRowIndices, csvData, dataVersion, rowsRef]);

  const activeMatch = matches[activeMatchIdx];

  useEffect(() => {
    if (!activeMatch || !gridRef.current) return;
    const visCol = visibleColIndices.indexOf(activeMatch.col);
    if (visCol === -1) return;
    gridRef.current.scrollTo(visCol, activeMatch.viewRow, 'both', 0, 0, {
      vAlign: 'center',
      hAlign: 'center',
    });
  }, [activeMatch, visibleColIndices, gridRef]);

  const matchSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) {
      s.add(`${m.dataRow}:${m.col}`);
    }
    return s;
  }, [matches]);

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
  }, [styleCtx, selectedDataRow, selectedActualCol, dataVersion, rowsRef]);
  const selectedCellWrap = selectedCellStyle?.wrap ?? selectedColWrap;
  const selectedCellValue =
    selectedDataRow !== undefined && selectedActualCol !== undefined
      ? (rowsRef.current[selectedDataRow]?.[selectedActualCol] ?? '')
      : '';
  const selectedCellLineCount = selectedCellValue
    ? selectedCellValue.split(/\r?\n/).length
    : 0;

  useEffect(() => {
    if (!onStatusChange) return;
    onStatusChange({
      fileName,
      dirty: dirtyCsv,
      totalRows: csvData ? rowsRef.current.length : 0,
      visibleRows: csvData ? viewRowIndices.length : 0,
      cols: csvData ? csvData.headers.length : 0,
      markerCount,
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
    markerCount,
    fileBytes,
    activeFormat,
    isReadOnly,
    dataVersion,
    rowsRef,
  ]);

  return {
    matches,
    activeMatchIdx,
    setActiveMatchIdx,
    activeMatch,
    matchSet,
    selectedColLabel,
    selectedCellWrap,
    selectedCellValue,
    selectedCellLineCount,
  };
}
