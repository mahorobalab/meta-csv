import { useCallback, useEffect, useMemo } from 'react';
import {
  CompactSelection,
  type DataEditorRef,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import type { MarkerColor, MetaCsvDocument, RowMarker } from '@meta-csv/schema';
import { MARKER_COLORS } from '../../MarkerControls';

export interface UseMarkerActionsParams {
  meta: MetaCsvDocument;
  filterIndices: Int32Array;
  onlyMarked: boolean;
  setOnlyMarked: (next: boolean) => void;
  activeMarkerColor: MarkerColor;
  setActiveMarkerColor: (color: MarkerColor) => void;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  gridRef: React.RefObject<DataEditorRef | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  patchMeta: (path: (string | number)[], value: unknown) => void;
  setStatusMsg: (msg: string) => void;
}

export function useMarkerActions({
  meta,
  filterIndices,
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
}: UseMarkerActionsParams) {
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
  }, [onlyMarked, markerMap.size, setOnlyMarked]);

  const viewRowIndices = useMemo(() => {
    if (!onlyMarked || markerMap.size === 0) return filterIndices;
    const src = filterIndices;
    const kept: number[] = [];
    for (let i = 0; i < src.length; i++) {
      const dr = src[i]!;
      if (markerMap.has(dr)) kept.push(dr);
    }
    return Int32Array.from(kept);
  }, [filterIndices, onlyMarked, markerMap]);

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
    [selectedDataRow, markerMap, markers, persistMarkers, setActiveMarkerColor],
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
  }, [persistMarkers, setOnlyMarked]);

  const jumpToViewRow = useCallback(
    (targetViewRow: number) => {
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
    },
    [gridRef, setSelection],
  );

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
    [viewRowIndices, jumpToViewRow, setStatusMsg],
  );

  const getRowPreview = useCallback(
    (dataRow: number): string => {
      const row = rowsRef.current[dataRow];
      if (!row) return '';
      const parts: string[] = [];
      for (let c = 0; c < row.length && parts.length < 3; c++) {
        const v = row[c]?.trim();
        if (v) parts.push(v);
      }
      return parts.join(' · ');
    },
    [rowsRef],
  );

  return {
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
    jumpToViewRow,
    jumpNextMarker,
    jumpPrevMarker,
    jumpToDataRow,
    getRowPreview,
  };
}
