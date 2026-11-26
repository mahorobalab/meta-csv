import React from 'react';
import type { HoverRowResizeState, RowResizeDragState } from '../hooks/useRowHeight';

export interface RowResizeOverlayProps {
  hoverRowResize: HoverRowResizeState | null;
  rowResizeDrag: RowResizeDragState | null;
  zoomScale: number;
  explicitRowHeightMap: Map<number, number>;
  visibleColIndices: number[];
  onClearHover: () => void;
  onStartDrag: (drag: RowResizeDragState) => void;
  onAutoFitRow: (dataRow: number, cols: Set<number>) => void;
}

export const RowResizeOverlay: React.FC<RowResizeOverlayProps> = ({
  hoverRowResize,
  rowResizeDrag,
  zoomScale,
  explicitRowHeightMap,
  visibleColIndices,
  onClearHover,
  onStartDrag,
  onAutoFitRow,
}) => (
  <>
    {hoverRowResize && !rowResizeDrag && (
      <div
        onMouseLeave={onClearHover}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.detail >= 2) {
            onAutoFitRow(hoverRowResize.dataRow, new Set(visibleColIndices));
            onClearHover();
            return;
          }
          const renderedH = hoverRowResize.bottomLocalY - hoverRowResize.topLocalY;
          const startBase =
            explicitRowHeightMap.get(hoverRowResize.dataRow) ??
            Math.max(20, Math.min(400, Math.round(renderedH / (zoomScale || 1))));
          onStartDrag({
            dataRow: hoverRowResize.dataRow,
            topLocalY: hoverRowResize.topLocalY,
            startClientY: e.clientY,
            startBaseHeight: startBase,
            currentBaseHeight: startBase,
            guideLocalY: hoverRowResize.bottomLocalY,
          });
        }}
        title="Drag to resize row height · Double-click to auto-fit"
        style={{
          position: 'absolute',
          left: hoverRowResize.leftLocalX,
          top: hoverRowResize.bottomLocalY - 5,
          width: hoverRowResize.width,
          height: 10,
          cursor: 'ns-resize',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: 2,
            background: 'rgba(59, 130, 246, 0.7)',
          }}
        />
      </div>
    )}

    {rowResizeDrag && (
      <>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: rowResizeDrag.guideLocalY,
            height: 2,
            background: '#3b82f6',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 52,
            top: Math.max(4, rowResizeDrag.guideLocalY - 22),
            padding: '1px 7px',
            borderRadius: 4,
            background: '#2563eb',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 41,
          }}
        >
          Row #{rowResizeDrag.dataRow + 1}: {rowResizeDrag.currentBaseHeight}px
        </div>
      </>
    )}
  </>
);
