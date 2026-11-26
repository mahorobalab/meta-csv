import { useCallback, useEffect, useMemo } from 'react';
import type { GridMouseEventArgs } from '@glideapps/glide-data-grid';
import type { MetaTextDocument, MetaTextFormat } from '@metatext-editor/schema';
import {
  estimateAutoRowHeight,
  patchMetaJsonc,
  resolveCellStyle,
  type ParsedCsvData,
} from '@metatext-editor/core';

const AUTO_ROW_HEIGHT_ROW_LIMIT = 20_000;

export interface HoverRowResizeState {
  viewRow: number;
  dataRow: number;
  bottomLocalY: number;
  topLocalY: number;
  leftLocalX: number;
  width: number;
}

export interface RowResizeDragState {
  dataRow: number;
  topLocalY: number;
  startClientY: number;
  startBaseHeight: number;
  currentBaseHeight: number;
  guideLocalY: number;
}

export interface UseRowHeightParams {
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  activeFormat: MetaTextFormat;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  autoWidths: number[];
  zoomScale: number;
  scaledDefaultRowHeight: number;
  scaledFontSize: number;
  effectiveDefaultRowHeight: number;
  effectiveDefaultFontSize: number;
  styleCtx: Parameters<typeof resolveCellStyle>[0] | null;
  dataVersion: number;
  rowResizeDrag: RowResizeDragState | null;
  setRowResizeDrag: React.Dispatch<React.SetStateAction<RowResizeDragState | null>>;
  setHoverRowResize: React.Dispatch<React.SetStateAction<HoverRowResizeState | null>>;
  patchMeta: (path: (string | number)[], value: unknown) => void;
  scheduleMetaSave: (nextText: string) => void;
}

export function useRowHeight({
  csvData,
  meta,
  metaTextRef,
  rowsRef,
  gridContainerRef,
  activeFormat,
  visibleColIndices,
  viewRowIndices,
  autoWidths,
  zoomScale,
  scaledDefaultRowHeight,
  scaledFontSize,
  effectiveDefaultRowHeight,
  effectiveDefaultFontSize,
  styleCtx,
  dataVersion,
  rowResizeDrag,
  setRowResizeDrag,
  setHoverRowResize,
  patchMeta,
  scheduleMetaSave,
}: UseRowHeightParams) {
  const explicitRowHeightMap = useMemo(() => {
    const map = new Map<number, number>();
    if (meta.rows) {
      for (const [k, v] of Object.entries(meta.rows)) {
        if (v?.height !== undefined) {
          const idx = Number(k);
          if (Number.isInteger(idx) && idx >= 0) {
            map.set(idx, v.height);
          }
        }
      }
    }
    return map;
  }, [meta.rows]);

  const allowFullAutoRowHeight = (csvData?.rows.length ?? 0) <= AUTO_ROW_HEIGHT_ROW_LIMIT;

  const hasMultilineRow = useMemo(() => {
    if (!csvData || !allowFullAutoRowHeight) return false;
    const rows = rowsRef.current;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      for (let c = 0; c < row.length; c++) {
        if (row[c]!.indexOf('\n') !== -1) return true;
      }
    }
    return false;
  }, [csvData, allowFullAutoRowHeight, dataVersion, rowsRef]);

  const { wrappedColSpecs, unwrappedVisibleColIndices } = useMemo(() => {
    if (!csvData) {
      return {
        wrappedColSpecs: [] as Array<{ colIdx: number; widthPx: number }>,
        unwrappedVisibleColIndices: [] as number[],
      };
    }
    const defaultWrap =
      activeFormat === 'log' || activeFormat === 'text' ? (meta.log?.wordWrap ?? false) : false;
    const wrapped: Array<{ colIdx: number; widthPx: number }> = [];
    const unwrapped: number[] = [];
    for (let i = 0; i < visibleColIndices.length; i++) {
      const colIdx = visibleColIndices[i]!;
      const key = csvData.columnKeys[colIdx]!;
      const colMeta = meta.columns?.[key];
      const isWrap = colMeta?.wrap ?? defaultWrap;
      if (isWrap) {
        const baseW = colMeta?.width ?? autoWidths[colIdx] ?? 140;
        wrapped.push({ colIdx, widthPx: Math.max(40, Math.round(baseW * zoomScale)) });
      } else {
        unwrapped.push(colIdx);
      }
    }
    return { wrappedColSpecs: wrapped, unwrappedVisibleColIndices: unwrapped };
  }, [
    csvData,
    visibleColIndices,
    meta.columns,
    meta.log?.wordWrap,
    activeFormat,
    autoWidths,
    zoomScale,
  ]);

  const needsDynamicRowHeight =
    explicitRowHeightMap.size > 0 ||
    (allowFullAutoRowHeight && (hasMultilineRow || wrappedColSpecs.length > 0));

  const dynamicRowHeight = useCallback(
    (viewRow: number) => {
      const dataRow = viewRowIndices[viewRow];
      if (dataRow === undefined) return scaledDefaultRowHeight;
      const explicit = explicitRowHeightMap.get(dataRow);
      if (explicit !== undefined) {
        return Math.max(18, Math.round(explicit * zoomScale));
      }
      if (!allowFullAutoRowHeight) {
        return scaledDefaultRowHeight;
      }
      const row = rowsRef.current[dataRow];
      if (!row) return scaledDefaultRowHeight;
      return estimateAutoRowHeight(
        row,
        wrappedColSpecs,
        hasMultilineRow ? unwrappedVisibleColIndices : [],
        {
          defaultHeight: scaledDefaultRowHeight,
          fontSize: scaledFontSize,
          maxHeight: Math.round(240 * zoomScale),
        },
      );
    },
    [
      viewRowIndices,
      explicitRowHeightMap,
      allowFullAutoRowHeight,
      scaledDefaultRowHeight,
      scaledFontSize,
      zoomScale,
      wrappedColSpecs,
      hasMultilineRow,
      unwrappedVisibleColIndices,
      rowsRef,
    ],
  );

  const rowHeightProp: number | ((row: number) => number) = needsDynamicRowHeight
    ? dynamicRowHeight
    : scaledDefaultRowHeight;

  const autoFitRows = useCallback(
    (dataRows: number[], forceWrapCols?: Set<number>, skipWrapCols?: Set<number>) => {
      if (!csvData || dataRows.length === 0) return;
      const defaultWrap =
        activeFormat === 'log' || activeFormat === 'text' ? (meta.log?.wordWrap ?? false) : false;
      let text = metaTextRef.current ?? '';
      const uniqueRows = Array.from(new Set(dataRows)).slice(0, 50);

      for (const dr of uniqueRows) {
        const row = rowsRef.current[dr];
        if (!row) continue;
        const wrappedSpecs: Array<{ colIdx: number; widthPx: number }> = [];
        const multilineCols: number[] = [];

        for (let i = 0; i < visibleColIndices.length; i++) {
          const colIdx = visibleColIndices[i]!;
          const key = csvData.columnKeys[colIdx]!;
          const colMeta = meta.columns?.[key];
          const cellStyle = styleCtx ? resolveCellStyle(styleCtx, dr, colIdx, row) : undefined;
          const isWrap = skipWrapCols?.has(colIdx)
            ? false
            : Boolean(forceWrapCols?.has(colIdx) || cellStyle?.wrap || (colMeta?.wrap ?? defaultWrap));
          if (isWrap) {
            const baseW = colMeta?.width ?? autoWidths[colIdx] ?? 140;
            wrappedSpecs.push({ colIdx, widthPx: Math.max(40, baseW) });
          } else {
            multilineCols.push(colIdx);
          }
        }

        const fitted = estimateAutoRowHeight(row, wrappedSpecs, multilineCols, {
          defaultHeight: effectiveDefaultRowHeight,
          fontSize: effectiveDefaultFontSize,
          maxHeight: 400,
        });
        const clamped = Math.max(20, Math.min(400, Math.round(fitted)));
        text = patchMetaJsonc(
          text,
          ['rows', String(dr), 'height'],
          clamped <= effectiveDefaultRowHeight ? undefined : clamped,
        );
      }

      scheduleMetaSave(text);
    },
    [
      csvData,
      activeFormat,
      meta.log?.wordWrap,
      meta.columns,
      visibleColIndices,
      styleCtx,
      autoWidths,
      effectiveDefaultRowHeight,
      effectiveDefaultFontSize,
      metaTextRef,
      rowsRef,
      scheduleMetaSave,
    ],
  );

  const resetRowHeights = useCallback(
    (dataRows: number[]) => {
      if (dataRows.length === 0) return;
      let text = metaTextRef.current ?? '';
      for (const dr of Array.from(new Set(dataRows)).slice(0, 50)) {
        text = patchMetaJsonc(text, ['rows', String(dr), 'height'], undefined);
      }
      scheduleMetaSave(text);
    },
    [metaTextRef, scheduleMetaSave],
  );

  const onGridMouseMove = useCallback(
    (args: GridMouseEventArgs) => {
      if (rowResizeDrag) return;
      const container = gridContainerRef.current;
      if (
        !container ||
        args.kind !== 'cell' ||
        args.location[0] !== -1 ||
        args.location[1] < 0
      ) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }

      const rect = container.getBoundingClientRect();
      const vr = args.location[1];
      let targetVr = -1;
      let bottomLocalY = 0;
      let topLocalY = 0;

      if (args.localEventY >= args.bounds.height - 5) {
        targetVr = vr;
        bottomLocalY = args.bounds.y + args.bounds.height - rect.top;
        topLocalY = args.bounds.y - rect.top;
      } else if (args.localEventY <= 4 && vr > 0) {
        targetVr = vr - 1;
        bottomLocalY = args.bounds.y - rect.top;
        const prevH =
          typeof rowHeightProp === 'function' ? rowHeightProp(targetVr) : rowHeightProp;
        topLocalY = bottomLocalY - prevH;
      }

      if (targetVr < 0) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }
      const dataRow = viewRowIndices[targetVr];
      if (dataRow === undefined) {
        setHoverRowResize((prev) => (prev !== null ? null : prev));
        return;
      }

      const leftLocalX = Math.max(0, args.bounds.x - rect.left);
      const width = Math.max(24, args.bounds.width);
      const roundedBottom = Math.round(bottomLocalY);

      setHoverRowResize((prev) => {
        if (
          prev &&
          prev.viewRow === targetVr &&
          Math.round(prev.bottomLocalY) === roundedBottom
        ) {
          return prev;
        }
        return {
          viewRow: targetVr,
          dataRow,
          bottomLocalY,
          topLocalY,
          leftLocalX,
          width,
        };
      });
    },
    [rowResizeDrag, gridContainerRef, rowHeightProp, viewRowIndices, setHoverRowResize],
  );

  useEffect(() => {
    if (!rowResizeDrag) return;
    const onMove = (e: MouseEvent) => {
      const deltaBase = (e.clientY - rowResizeDrag.startClientY) / (zoomScale || 1);
      const nextBase = Math.max(
        20,
        Math.min(400, Math.round(rowResizeDrag.startBaseHeight + deltaBase)),
      );
      const nextGuideY = rowResizeDrag.topLocalY + nextBase * zoomScale;
      setRowResizeDrag((prev) =>
        prev ? { ...prev, currentBaseHeight: nextBase, guideLocalY: nextGuideY } : null,
      );
    };
    const onUp = (e: MouseEvent) => {
      const deltaBase = (e.clientY - rowResizeDrag.startClientY) / (zoomScale || 1);
      const finalBase = Math.max(
        20,
        Math.min(400, Math.round(rowResizeDrag.startBaseHeight + deltaBase)),
      );
      patchMeta(['rows', String(rowResizeDrag.dataRow), 'height'], finalBase);
      setRowResizeDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [
    rowResizeDrag?.dataRow,
    rowResizeDrag?.startClientY,
    rowResizeDrag?.startBaseHeight,
    rowResizeDrag?.topLocalY,
    zoomScale,
    patchMeta,
    setRowResizeDrag,
  ]);

  return {
    explicitRowHeightMap,
    rowHeightProp,
    autoFitRows,
    resetRowHeights,
    onGridMouseMove,
  };
}
