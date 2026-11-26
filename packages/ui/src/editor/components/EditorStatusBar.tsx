import React, { useState } from 'react';
import type { MetaTextFormat } from '@meta-csv/schema';

export interface EditorStatusBarProps {
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  fileName: string;
  filePath?: string;
  dirtyCsv: boolean;
  hasCsvData: boolean;
  activeFormat: MetaTextFormat;
  encoding?: string;
  lineEnding?: string;
  isReadOnly: boolean;
  invalidLineCount?: number;
  statusMsg: string;
  selectedCellLineCount: number;
  showCellInspector: boolean;
  onOpenCellInspector: () => void;
  zoomScale: number;
  onResetZoom: () => void;
  visibleRowCount: number;
  totalRowCount: number;
  colCount: number;
  markerCount: number;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  isDark,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  fileName,
  filePath,
  dirtyCsv,
  hasCsvData,
  activeFormat,
  encoding,
  lineEnding,
  isReadOnly,
  invalidLineCount,
  statusMsg,
  selectedCellLineCount,
  showCellInspector,
  onOpenCellInspector,
  zoomScale,
  onResetZoom,
  visibleRowCount,
  totalRowCount,
  colCount,
  markerCount,
}) => {
  const [showPathTooltip, setShowPathTooltip] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        height: 24,
        padding: '0 10px',
        background: toolbarBg,
        borderTop: `1px solid ${toolbarBorder}`,
        color: toolbarFg,
        fontSize: 11.5,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
          position: 'relative',
        }}
      >
        <span
          onMouseEnter={() => {
            if (filePath) setShowPathTooltip(true);
          }}
          onMouseLeave={() => setShowPathTooltip(false)}
          style={{
            fontWeight: dirtyCsv ? 700 : 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: filePath ? 'default' : undefined,
          }}
          title={filePath || fileName}
        >
          {fileName || 'MetaText Editor'}
          {dirtyCsv ? ' *' : ''}
        </span>
        {showPathTooltip && filePath && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              zIndex: 80,
              maxWidth: 'min(76vw, 720px)',
              padding: '4px 8px',
              borderRadius: 5,
              background: isDark ? '#18181b' : '#ffffff',
              color: toolbarFg,
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.28)',
              fontSize: 11,
              fontFamily: "'Consolas', 'Courier New', monospace",
              lineHeight: 1.35,
              wordBreak: 'break-all',
              pointerEvents: 'none',
            }}
          >
            {filePath}
          </div>
        )}
        {hasCsvData && encoding && lineEnding && (
          <span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>
            {activeFormat.toUpperCase()} · {encoding.toUpperCase()} · {lineEnding.toUpperCase()}
            {isReadOnly ? ' · RO' : ''}
            {invalidLineCount ? ` · ${invalidLineCount} raw` : ''}
          </span>
        )}
        {statusMsg && <span style={{ opacity: 0.78, whiteSpace: 'nowrap' }}>{statusMsg}</span>}
      </div>
      {hasCsvData && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            opacity: 0.85,
            whiteSpace: 'nowrap',
          }}
        >
          {selectedCellLineCount > 1 && !showCellInspector && (
            <button
              type="button"
              onClick={onOpenCellInspector}
              style={{
                border: `1px solid ${toolbarBorder}`,
                borderRadius: 4,
                background: 'transparent',
                color: toolbarFg,
                fontSize: 11,
                padding: '0 6px',
                cursor: 'pointer',
              }}
            >
              {selectedCellLineCount} lines (Inspect)
            </button>
          )}
          {zoomScale !== 1 && (
            <button
              type="button"
              title="Reset zoom to 100% (Ctrl+0)"
              onClick={onResetZoom}
              style={{
                border: `1px solid ${toolbarBorder}`,
                borderRadius: 4,
                background: 'transparent',
                color: toolbarFg,
                fontSize: 11,
                padding: '0 6px',
                cursor: 'pointer',
              }}
            >
              {Math.round(zoomScale * 100)}%
            </button>
          )}
          <span>
            {visibleRowCount !== totalRowCount
              ? `Rows=${visibleRowCount.toLocaleString()} / ${totalRowCount.toLocaleString()}, Cols=${colCount}`
              : `Rows=${totalRowCount.toLocaleString()}, Cols=${colCount}`}
          </span>
          {markerCount > 0 && <span>Markers={markerCount}</span>}
        </div>
      )}
    </div>
  );
};
