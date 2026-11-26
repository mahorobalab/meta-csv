import { useEffect } from 'react';
import type { GridSelection } from '@glideapps/glide-data-grid';
import type { ParsedCsvData } from '@meta-csv/core';
import type { EditorHostMode } from '../../SettingsAboutDialogs';
import type { CellRangeRect } from '../types';
import type { CellMoveDirection } from '../utils/cellNavigationUtils';
import { isContiguousIndices } from '../utils/rowOrderUtils';

export interface UseEditorShortcutsParams {
  isActive: boolean;
  hostMode: EditorHostMode;
  csvData: ParsedCsvData | null;
  isReadOnly: boolean;
  selection: GridSelection;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  zoomScale: number;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  isF2EditTriggerRef: React.MutableRefObject<boolean>;
  hasSaveAs: boolean;
  hasNewFile: boolean;
  hasCloseFile: boolean;
  handleSaveCsv: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  handleNewFileAction: () => void;
  handleCloseFileAction: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  toggleMarkerOnSelection: () => void;
  jumpNextMarker: () => void;
  jumpPrevMarker: () => void;
  handleCopyColumns: (actualCols: number[], colKeys: string[]) => Promise<void>;
  handlePasteColumns: (startActualCol: number, withStyle: boolean) => Promise<void>;
  handleCopyRows: (dataRows: number[]) => Promise<void>;
  handlePasteRows: (startViewRow: number, withStyle: boolean) => Promise<void>;
  handleCopyCells: (range: CellRangeRect) => Promise<void>;
  handlePasteCells: (range: CellRangeRect, withStyle: boolean) => Promise<void>;
  startF2CellEdit: () => void;
  moveSelectionInRange: (direction: CellMoveDirection) => void;
}

export function useEditorShortcuts({
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
  hasSaveAs,
  hasNewFile,
  hasCloseFile,
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
}: UseEditorShortcutsParams) {
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const mod = e.ctrlKey || e.metaKey;

      if (!inTextInput && ((mod && e.key.toLowerCase() === 'm') || (mod && e.key === 'F2'))) {
        e.preventDefault();
        toggleMarkerOnSelection();
        return;
      }

      // Alt+F2 / Alt+Shift+F2 -> Jump to next / previous row marker
      if (!inTextInput && e.key === 'F2' && e.altKey && !mod) {
        e.preventDefault();
        if (e.shiftKey) jumpPrevMarker();
        else jumpNextMarker();
        return;
      }

      if (!inTextInput && mod && e.key === '0' && zoomScale !== 1) {
        e.preventDefault();
        setZoomScale(1);
        return;
      }

      if (!mod || hostMode === 'vscode') return;
      const key = e.key.toLowerCase();
      if (key === 's' && e.shiftKey && hasSaveAs) {
        e.preventDefault();
        void handleSaveAs();
      } else if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleSaveCsv();
      } else if (key === 'n' && !e.shiftKey && hasNewFile) {
        e.preventDefault();
        handleNewFileAction();
      } else if (key === 'w' && !e.shiftKey && hasCloseFile) {
        e.preventDefault();
        handleCloseFileAction();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isActive,
    hostMode,
    handleSaveCsv,
    handleSaveAs,
    handleNewFileAction,
    handleCloseFileAction,
    hasSaveAs,
    hasNewFile,
    hasCloseFile,
    handleUndo,
    handleRedo,
    toggleMarkerOnSelection,
    jumpNextMarker,
    jumpPrevMarker,
    zoomScale,
    setZoomScale,
  ]);

  // Capture-phase keyboard shortcuts for Excel-like cell navigation (Tab/Enter), F2 inline edit,
  // and Column / Row / Cell clipboard (Ctrl+C, Ctrl+V, Ctrl+Shift+V)
  useEffect(() => {
    if (!isActive || !csvData) return;
    const hasColSel = selection.columns.length > 0;
    const hasRowSel = selection.rows.length > 0 && !hasColSel;
    const hasCellSel = !hasColSel && !hasRowSel && Boolean(selection.current);
    if (!hasColSel && !hasRowSel && !hasCellSel) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (inTextInput) return;

      const mod = e.ctrlKey || e.metaKey;

      // Excel-like F2 -> enter cell edit mode with caret at end (not select-all)
      if (hasCellSel && e.key === 'F2' && !mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        startF2CellEdit();
        return;
      }

      // Excel-like Tab / Shift+Tab / Enter / Shift+Enter cell navigation
      if (hasCellSel && !mod && !e.altKey) {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          moveSelectionInRange(e.shiftKey ? 'shift-tab' : 'tab');
          return;
        }
        if (e.key === 'Enter' && !isF2EditTriggerRef.current) {
          e.preventDefault();
          e.stopPropagation();
          moveSelectionInRange(e.shiftKey ? 'shift-enter' : 'enter');
          return;
        }
      }

      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;

      if (hasColSel) {
        const selVisCols = selection.columns.toArray();
        if (selVisCols.length === 0) return;
        const targetVisCols = isContiguousIndices(selVisCols) ? selVisCols : [selVisCols[0]!];
        const targetActualCols: number[] = [];
        const targetColKeys: string[] = [];
        for (const vc of targetVisCols) {
          const ac = visibleColIndices[vc];
          if (ac === undefined) continue;
          targetActualCols.push(ac);
          targetColKeys.push(csvData.columnKeys[ac] ?? String(ac));
        }
        if (targetActualCols.length === 0) return;

        if (key === 'c' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          void handleCopyColumns(targetActualCols, targetColKeys);
        } else if (key === 'v' && !e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteColumns(targetActualCols[0]!, true);
        } else if (key === 'v' && e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteColumns(targetActualCols[0]!, false);
        }
        return;
      }

      if (hasRowSel) {
        const selViewRows = selection.rows.toArray();
        if (selViewRows.length === 0) return;
        const targetViewRows = isContiguousIndices(selViewRows) ? selViewRows : [selViewRows[0]!];
        const targetDataRows: number[] = [];
        for (const vr of targetViewRows) {
          const dr = viewRowIndices[vr];
          if (dr !== undefined) targetDataRows.push(dr);
        }
        if (targetDataRows.length === 0) return;

        if (key === 'c' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          void handleCopyRows(targetDataRows);
        } else if (key === 'v' && !e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteRows(targetViewRows[0]!, true);
        } else if (key === 'v' && e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteRows(targetViewRows[0]!, false);
        }
        return;
      }

      if (hasCellSel && selection.current) {
        const range = selection.current.range;
        const rect: CellRangeRect = {
          x: range.x,
          y: range.y,
          width: range.width,
          height: range.height,
        };
        if (key === 'c' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          void handleCopyCells(rect);
        } else if (key === 'v' && !e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteCells(rect, true);
        } else if (key === 'v' && e.shiftKey && !isReadOnly) {
          e.preventDefault();
          e.stopPropagation();
          void handlePasteCells(rect, false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    isActive,
    csvData,
    selection.columns,
    selection.rows,
    selection.current,
    visibleColIndices,
    viewRowIndices,
    isReadOnly,
    isF2EditTriggerRef,
    handleCopyColumns,
    handlePasteColumns,
    handleCopyRows,
    handlePasteRows,
    handleCopyCells,
    handlePasteCells,
    startF2CellEdit,
    moveSelectionInRange,
  ]);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      setZoomScale((prev) =>
        Math.round(Math.max(0.6, Math.min(2.5, prev + step)) * 10) / 10,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [csvData, gridContainerRef, setZoomScale]);
}
