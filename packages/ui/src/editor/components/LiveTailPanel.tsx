import React, { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowDownToLine,
  Pause,
  Play,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { FoxTailIcon } from '../../icons/FoxTailIcon';
import type { TailLineEntry, TailLogLevel } from '../hooks/useLiveTail';

const TAIL_LINE_LIMIT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '10', label: '10 lines' },
  { value: '20', label: '20 lines' },
  { value: '30', label: '30 lines' },
  { value: '40', label: '40 lines' },
  { value: '50', label: '50 lines' },
  { value: '100', label: '100 lines' },
  { value: '150', label: '150 lines' },
  { value: '200', label: '200 lines' },
  { value: 'unlimited', label: 'No limit' },
];

export interface LiveTailColumn {
  actualCol: number;
  title: string;
  width: number;
}

export interface LiveTailPanelProps {
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  columns: LiveTailColumn[];
  showRowNums: boolean;
  rowMarkerWidth: number;
  scaledFontSize: number;
  scaledRowHeight: number;
  scaledHeaderHeight: number;
  lines: TailLineEntry[];
  maxLines: number | null;
  paused: boolean;
  tailFollowGrid: boolean;
  onChangeMaxLines: (next: number | null) => void;
  onTogglePaused: () => void;
  onToggleFollowGrid: () => void;
  onClear: () => void;
  onClose: () => void;
}

function getLevelStyle(level: TailLogLevel, isDark: boolean): React.CSSProperties {
  switch (level) {
    case 'error':
      return {
        color: isDark ? '#fca5a5' : '#b91c1c',
        background: isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.10)',
      };
    case 'warn':
      return {
        color: isDark ? '#fcd34d' : '#b45309',
        background: isDark ? 'rgba(245, 158, 11, 0.13)' : 'rgba(245, 158, 11, 0.10)',
      };
    case 'debug':
      return {
        opacity: 0.68,
      };
    default:
      return {};
  }
}

export const LiveTailPanel: React.FC<LiveTailPanelProps> = ({
  isDark,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  btnStyle,
  columns,
  showRowNums,
  rowMarkerWidth,
  scaledFontSize,
  scaledRowHeight,
  scaledHeaderHeight,
  lines,
  maxLines,
  paused,
  tailFollowGrid,
  onChangeMaxLines,
  onTogglePaused,
  onToggleFollowGrid,
  onClear,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'raw'>('grid');
  const [panelHeight, setPanelHeight] = useState<number>(220);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const maxH = Math.max(240, Math.round(window.innerHeight * 0.75));
      setPanelHeight(Math.max(100, Math.min(maxH, startH + delta)));
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (paused) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, paused, viewMode]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    if (!nearBottom && !paused) {
      onTogglePaused();
    } else if (nearBottom && paused) {
      onTogglePaused();
    }
  };

  const modeBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle,
    height: 22,
    padding: '0 7px',
    fontSize: 11,
    borderColor: active ? '#3b82f6' : toolbarBorder,
    background: active
      ? isDark
        ? 'rgba(59, 130, 246, 0.24)'
        : '#dbeafe'
      : btnStyle.background,
    color: active ? (isDark ? '#93c5fd' : '#1d4ed8') : btnStyle.color,
    fontWeight: active ? 600 : 500,
  });

  const cellBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.10)';
  const totalGridWidth =
    (showRowNums ? rowMarkerWidth : 0) + columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <div
      style={{
        height: panelHeight,
        minHeight: 100,
        background: isDark ? '#1e1e1e' : '#ffffff',
        color: toolbarFg,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Drag-to-resize top splitter handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize Live Tail panel height"
        onMouseDown={handleResizeStart}
        style={{
          height: 5,
          cursor: 'ns-resize',
          background: isResizing
            ? '#3b82f6'
            : isDark
              ? 'rgba(59, 130, 246, 0.45)'
              : 'rgba(59, 130, 246, 0.35)',
          flexShrink: 0,
          transition: isResizing ? undefined : 'background 120ms ease',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 10px',
          background: toolbarBg,
          borderBottom: `1px solid ${toolbarBorder}`,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: paused ? '#f59e0b' : '#10b981',
              boxShadow: paused ? undefined : '0 0 0 3px rgba(16, 185, 129, 0.22)',
              display: 'inline-block',
            }}
          />
          <FoxTailIcon size={14} />
          <strong>Live Tail</strong>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            ({lines.length} lines · {paused ? 'Paused' : 'Watching'})
          </span>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <select
            aria-label="Live Tail line limit"
            title="Maximum lines kept in Live Tail (oldest lines are removed from top)"
            value={maxLines === null ? 'unlimited' : String(maxLines)}
            onChange={(e) => {
              const v = e.target.value;
              onChangeMaxLines(v === 'unlimited' ? null : Number(v));
            }}
            style={{
              height: 22,
              padding: '0 6px',
              borderRadius: 4,
              border: `1px solid ${toolbarBorder}`,
              background: isDark ? '#27272c' : '#ffffff',
              color: toolbarFg,
              fontSize: 11,
              cursor: 'pointer',
              marginRight: 2,
            }}
          >
            {TAIL_LINE_LIMIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 4 }}>
            <button
              type="button"
              title="Grid view (aligned with main grid columns & zoom)"
              onClick={() => setViewMode('grid')}
              style={modeBtnStyle(viewMode === 'grid')}
            >
              <Table2 size={11} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              title="Raw view (unparsed log text)"
              onClick={() => setViewMode('raw')}
              style={modeBtnStyle(viewMode === 'raw')}
            >
              <AlignLeft size={11} />
              <span>Raw</span>
            </button>
          </div>
          <button
            type="button"
            title="Auto-scroll main grid to bottom as new lines arrive"
            onClick={onToggleFollowGrid}
            style={{
              ...btnStyle,
              height: 22,
              padding: '0 7px',
              fontSize: 11,
              borderColor: tailFollowGrid ? '#10b981' : toolbarBorder,
              background: tailFollowGrid
                ? isDark
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(16, 185, 129, 0.12)'
                : btnStyle.background,
            }}
          >
            <ArrowDownToLine size={11} />
            <span>Follow Grid</span>
          </button>
          <button
            type="button"
            title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
            onClick={onTogglePaused}
            style={{ ...btnStyle, height: 22, padding: '0 7px', fontSize: 11 }}
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            title="Clear Live Tail buffer"
            onClick={onClear}
            style={{ ...btnStyle, height: 22, padding: '0 7px', fontSize: 11 }}
          >
            <Trash2 size={11} />
            <span>Clear</span>
          </button>
          <button
            type="button"
            aria-label="Close Live Tail Panel"
            title="Close Live Tail Panel"
            onClick={onClose}
            style={{ ...btnStyle, height: 22, padding: '0 5px' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          fontSize: scaledFontSize,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ padding: '12px 14px', opacity: 0.6, fontSize: 12 }}>
            Waiting for new log lines...
          </div>
        ) : viewMode === 'grid' && columns.length > 0 ? (
          <table
            style={{
              width: totalGridWidth,
              minWidth: totalGridWidth,
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              fontSize: scaledFontSize,
              fontFamily: 'inherit',
            }}
          >
            <colgroup>
              {showRowNums && <col style={{ width: rowMarkerWidth }} />}
              {columns.map((col) => (
                <col key={col.actualCol} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  height: scaledHeaderHeight,
                  background: isDark ? '#252526' : '#f1f5f9',
                  borderBottom: `1px solid ${toolbarBorder}`,
                }}
              >
                {showRowNums && (
                  <th
                    style={{
                      padding: '0 6px',
                      textAlign: 'center',
                      fontWeight: 600,
                      opacity: 0.65,
                      borderRight: `1px solid ${cellBorder}`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      boxSizing: 'border-box',
                    }}
                  >
                    #
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.actualCol}
                    style={{
                      padding: '0 8px',
                      textAlign: 'left',
                      fontWeight: 600,
                      borderRight: `1px solid ${cellBorder}`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      boxSizing: 'border-box',
                    }}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((entry) => (
                <tr
                  key={entry.id}
                  style={{
                    height: scaledRowHeight,
                    borderBottom: `1px solid ${cellBorder}`,
                    ...getLevelStyle(entry.level, isDark),
                  }}
                >
                  {showRowNums && (
                    <td
                      style={{
                        padding: '0 6px',
                        textAlign: 'center',
                        opacity: 0.6,
                        borderRight: `1px solid ${cellBorder}`,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        userSelect: 'none',
                        fontSize: Math.max(11, Math.round(scaledFontSize * 0.92)),
                        boxSizing: 'border-box',
                      }}
                    >
                      {entry.lineNo}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.actualCol}
                      style={{
                        padding: '0 8px',
                        borderRight: `1px solid ${cellBorder}`,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        boxSizing: 'border-box',
                      }}
                    >
                      {entry.cells[col.actualCol] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div
            style={{
              padding: '6px 0',
              fontFamily: "'Consolas', 'Courier New', monospace",
              fontSize: Math.max(10, Math.round(scaledFontSize * 0.92)),
              lineHeight: 1.45,
            }}
          >
            {lines.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '1px 10px',
                  whiteSpace: 'pre',
                  ...getLevelStyle(entry.level, isDark),
                }}
              >
                <span
                  style={{
                    minWidth: 48,
                    textAlign: 'right',
                    opacity: 0.45,
                    userSelect: 'none',
                    flexShrink: 0,
                    fontSize: Math.max(10, Math.round(scaledFontSize * 0.85)),
                  }}
                >
                  {entry.lineNo}
                </span>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
