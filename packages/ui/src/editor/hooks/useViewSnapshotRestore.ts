import { useCallback, useEffect, useImperativeHandle } from 'react';
import {
  CompactSelection,
  type DataEditorRef,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import type { ParsedCsvData } from '@metatext-editor/core';
import type { EditorViewSnapshot, MetaTextEditorHandle } from '../types';

export interface UseViewSnapshotRestoreParams {
  ref: React.ForwardedRef<MetaTextEditorHandle>;
  csvData: ParsedCsvData | null;
  visibleColCount: number;
  viewRowCount: number;
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  zoomScale: number;
  filterQuery: string;
  filterContextRows: number;
  collapseColKey: string;
  onlyMarked: boolean;
  searchQuery: string;
  showCellInspector: boolean;
  gridRef: React.RefObject<DataEditorRef | null>;
  visibleRegionRef: React.MutableRefObject<{ x: number; y: number }>;
  pendingRestoreSnapshotRef: React.MutableRefObject<EditorViewSnapshot | null>;
  handleSaveCsv: () => Promise<void>;
  serializeCurrentCsv: () => Uint8Array | null;
  applyUndoLocal: () => boolean;
  applyRedoLocal: () => boolean;
  setReloadTick: React.Dispatch<React.SetStateAction<number>>;
  setDirtyCsv: (dirty: boolean) => void;
}

export function useViewSnapshotRestore({
  ref,
  csvData,
  visibleColCount,
  viewRowCount,
  selection,
  setSelection,
  zoomScale,
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
}: UseViewSnapshotRestoreParams) {
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
      setReloadTick,
      setDirtyCsv,
      visibleRegionRef,
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
    const maxCol = Math.max(0, visibleColCount - 1);
    const maxRow = Math.max(0, viewRowCount - 1);
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
  }, [csvData, visibleColCount, viewRowCount, gridRef, visibleRegionRef, pendingRestoreSnapshotRef, setSelection]);

  useEffect(() => {
    if (!pendingRestoreSnapshotRef.current || !csvData) return;
    const rafId = window.requestAnimationFrame(() => {
      applyPendingViewRestore();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [csvData, applyPendingViewRestore, pendingRestoreSnapshotRef]);

  return { applyPendingViewRestore };
}
