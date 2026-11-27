import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';
import { useI18n } from '../../i18n';

const ZOOM_PRESETS = [0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5];

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
  onZoomChange: (nextScale: number) => void;
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
  onZoomChange,
  visibleRowCount,
  totalRowCount,
  colCount,
  markerCount,
}) => {
  const { t } = useI18n();
  const [showPathTooltip, setShowPathTooltip] = useState(false);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const zoomWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showZoomMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (zoomWrapRef.current && !zoomWrapRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowZoomMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [showZoomMenu]);

  const zoomPercent = Math.round(zoomScale * 100);
  const stepZoom = (delta: number) => {
    const next = Math.round(Math.max(0.6, Math.min(2.5, zoomScale + delta)) * 100) / 100;
    onZoomChange(next);
  };

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
              {t('status.linesInspect', { count: selectedCellLineCount })}
            </button>
          )}
          <span style={{ opacity: 0.85 }}>
            {visibleRowCount !== totalRowCount
              ? t('status.rowsFiltered', {
                  visible: visibleRowCount.toLocaleString(),
                  total: totalRowCount.toLocaleString(),
                  cols: colCount,
                })
              : t('status.rowsTotal', {
                  total: totalRowCount.toLocaleString(),
                  cols: colCount,
                })}
          </span>
          {markerCount > 0 && (
            <span style={{ opacity: 0.85 }}>{t('status.markers', { count: markerCount })}</span>
          )}

          {/* Always-visible clickable zoom selector at bottom-right */}
          <div ref={zoomWrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              title={t('status.zoomTooltip')}
              aria-label={t('status.zoomAria', { percent: zoomPercent })}
              onClick={() => setShowZoomMenu((v) => !v)}
              style={{
                border: `1px solid ${showZoomMenu || zoomScale !== 1 ? '#3b82f6' : toolbarBorder}`,
                borderRadius: 4,
                background: showZoomMenu
                  ? isDark
                    ? 'rgba(59, 130, 246, 0.22)'
                    : '#dbeafe'
                  : 'transparent',
                color: toolbarFg,
                fontSize: 11,
                fontWeight: zoomScale !== 1 ? 600 : 500,
                padding: '0 6px',
                height: 18,
                cursor: 'pointer',
                minWidth: 42,
              }}
            >
              {zoomPercent}%
            </button>

            {showZoomMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 90,
                  width: 156,
                  padding: 8,
                  borderRadius: 7,
                  background: isDark ? '#1f1f23' : '#ffffff',
                  color: toolbarFg,
                  border: `1px solid ${toolbarBorder}`,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.32)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    title={t('status.zoomOut')}
                    onClick={() => stepZoom(-0.1)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${toolbarBorder}`,
                      background: isDark ? '#27272c' : '#f8fafc',
                      color: toolbarFg,
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    title={t('status.zoomReset')}
                    onClick={() => {
                      onZoomChange(1);
                      setShowZoomMenu(false);
                    }}
                    style={{
                      flex: 1,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${toolbarBorder}`,
                      background: isDark ? '#27272c' : '#f8fafc',
                      color: toolbarFg,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {zoomPercent}%
                  </button>
                  <button
                    type="button"
                    title={t('status.zoomIn')}
                    onClick={() => stepZoom(0.1)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${toolbarBorder}`,
                      background: isDark ? '#27272c' : '#f8fafc',
                      color: toolbarFg,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 4,
                  }}
                >
                  {ZOOM_PRESETS.map((preset) => {
                    const pct = Math.round(preset * 100);
                    const isCurrent = Math.abs(zoomScale - preset) < 0.005;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          onZoomChange(preset);
                          setShowZoomMenu(false);
                        }}
                        style={{
                          height: 22,
                          borderRadius: 4,
                          border: `1px solid ${isCurrent ? '#3b82f6' : toolbarBorder}`,
                          background: isCurrent
                            ? isDark
                              ? 'rgba(59, 130, 246, 0.25)'
                              : '#dbeafe'
                            : 'transparent',
                          color: isCurrent ? (isDark ? '#93c5fd' : '#1d4ed8') : toolbarFg,
                          fontSize: 11,
                          fontWeight: isCurrent ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    opacity: 0.65,
                    textAlign: 'center',
                    paddingTop: 2,
                    borderTop: `1px solid ${toolbarBorder}`,
                  }}
                >
                  Ctrl+Wheel, Ctrl+0
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
