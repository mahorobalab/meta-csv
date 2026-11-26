import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
} from 'lucide-react';
import type { MarkerColor, RowMarker } from '@meta-csv/schema';

export const MARKER_COLORS: MarkerColor[] = ['amber', 'rose', 'emerald', 'sky', 'violet'];

export const MARKER_PALETTE: Record<
  MarkerColor,
  { label: string; bar: string; rowBgLight: string; rowBgDark: string }
> = {
  amber: {
    label: 'Amber',
    bar: '#f59e0b',
    rowBgLight: 'rgba(245, 158, 11, 0.14)',
    rowBgDark: 'rgba(245, 158, 11, 0.16)',
  },
  rose: {
    label: 'Rose',
    bar: '#f43f5e',
    rowBgLight: 'rgba(244, 63, 94, 0.13)',
    rowBgDark: 'rgba(244, 63, 94, 0.18)',
  },
  emerald: {
    label: 'Emerald',
    bar: '#10b981',
    rowBgLight: 'rgba(16, 185, 129, 0.13)',
    rowBgDark: 'rgba(16, 185, 129, 0.16)',
  },
  sky: {
    label: 'Sky',
    bar: '#0ea5e9',
    rowBgLight: 'rgba(14, 165, 233, 0.12)',
    rowBgDark: 'rgba(14, 165, 233, 0.16)',
  },
  violet: {
    label: 'Violet',
    bar: '#8b5cf6',
    rowBgLight: 'rgba(139, 92, 246, 0.13)',
    rowBgDark: 'rgba(139, 92, 246, 0.18)',
  },
};

export interface MarkerControlsProps {
  markers: RowMarker[];
  visibleMarkerCount: number;
  visibleMarkerRowSet: Set<number>;
  selectedDataRow: number | undefined;
  selectedMarker: RowMarker | undefined;
  activeColor: MarkerColor;
  onActiveColorChange: (color: MarkerColor) => void;
  onlyMarked: boolean;
  onOnlyMarkedChange: (next: boolean) => void;
  onToggleSelectedMarker: () => void;
  onJumpPrev: () => void;
  onJumpNext: () => void;
  onJumpToRow: (dataRow: number) => void;
  onUpdateMarkerNote: (dataRow: number, note: string) => void;
  onCycleMarkerColor: (dataRow: number) => void;
  onRemoveMarker: (dataRow: number) => void;
  onClearAll: () => void;
  getRowPreview: (dataRow: number) => string;
  themeMode: 'light' | 'dark';
}

export const MarkerControls: React.FC<MarkerControlsProps> = ({
  markers,
  visibleMarkerCount,
  visibleMarkerRowSet,
  selectedDataRow,
  selectedMarker,
  activeColor,
  onActiveColorChange,
  onlyMarked,
  onOnlyMarkedChange,
  onToggleSelectedMarker,
  onJumpPrev,
  onJumpNext,
  onJumpToRow,
  onUpdateMarkerNote,
  onCycleMarkerColor,
  onRemoveMarker,
  onClearAll,
  getRowPreview,
  themeMode,
}) => {
  const [showList, setShowList] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showList) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowList(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showList]);

  const isDark = themeMode === 'dark';
  const border = isDark ? '#3c3c3c' : '#cbd5e1';
  const fg = isDark ? '#e2e8f0' : '#0f172a';
  const inputBg = isDark ? '#141416' : '#ffffff';

  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    padding: '3px 6px',
    height: 24,
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${border}`,
    background: isDark ? '#2d2d30' : '#ffffff',
    color: fg,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const selectedColor = selectedMarker
    ? MARKER_PALETTE[selectedMarker.color ?? 'amber'].bar
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      <button
        type="button"
        style={{
          ...iconBtnStyle,
          borderColor: selectedColor ?? border,
          background: selectedMarker
            ? isDark
              ? MARKER_PALETTE[selectedMarker.color ?? 'amber'].rowBgDark
              : MARKER_PALETTE[selectedMarker.color ?? 'amber'].rowBgLight
            : iconBtnStyle.background,
          color: selectedColor ?? fg,
          opacity: selectedDataRow === undefined ? 0.5 : 1,
        }}
        disabled={selectedDataRow === undefined}
        onClick={onToggleSelectedMarker}
        title="Toggle marker on selected row (Ctrl+M / Ctrl+F2)"
        aria-label="Toggle marker"
      >
        {selectedMarker ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
      </button>

      {/* Color swatches */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '0 2px',
        }}
        title="Marker color"
      >
        {MARKER_COLORS.map((color) => {
          const pal = MARKER_PALETTE[color];
          const isCurrent = (selectedMarker?.color ?? activeColor) === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`Marker color ${pal.label}`}
              title={`Marker color: ${pal.label}`}
              onClick={() => onActiveColorChange(color)}
              style={{
                width: 10,
                height: 10,
                padding: 0,
                borderRadius: '50%',
                border: isCurrent
                  ? `2px solid ${isDark ? '#f8fafc' : '#0f172a'}`
                  : '1px solid rgba(128,128,128,0.45)',
                background: pal.bar,
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>

      <button
        type="button"
        style={{ ...iconBtnStyle, padding: '3px 4px', opacity: visibleMarkerCount === 0 ? 0.45 : 1 }}
        disabled={visibleMarkerCount === 0}
        onClick={onJumpPrev}
        title="Previous marker (Shift+F2)"
        aria-label="Previous marker"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        style={{ ...iconBtnStyle, padding: '3px 4px', opacity: visibleMarkerCount === 0 ? 0.45 : 1 }}
        disabled={visibleMarkerCount === 0}
        onClick={onJumpNext}
        title="Next marker (F2)"
        aria-label="Next marker"
      >
        <ChevronDown size={14} />
      </button>

      <button
        type="button"
        style={{
          ...iconBtnStyle,
          borderColor: onlyMarked ? '#f59e0b' : border,
          background: onlyMarked ? 'rgba(245, 158, 11, 0.18)' : iconBtnStyle.background,
          fontWeight: onlyMarked ? 600 : 400,
          opacity: markers.length === 0 ? 0.5 : 1,
        }}
        disabled={markers.length === 0}
        onClick={() => onOnlyMarkedChange(!onlyMarked)}
        title="Show only marked rows"
      >
        <Bookmark size={12} color={onlyMarked ? '#f59e0b' : undefined} fill={onlyMarked ? '#f59e0b' : 'none'} />
        <span>Only</span>
      </button>

      <button
        type="button"
        style={{
          ...iconBtnStyle,
          borderColor: showList ? '#3b82f6' : border,
        }}
        onClick={() => setShowList((s) => !s)}
        title="Open marker list"
      >
        <span>{markers.length}</span>
        <ChevronDown size={12} />
      </button>

      {showList && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 58,
            width: 380,
            maxHeight: 380,
            overflowY: 'auto',
            padding: 10,
            borderRadius: 6,
            background: isDark ? '#1f1f23' : '#ffffff',
            border: `1px solid ${border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 12 }}>Markers ({markers.length})</strong>
            {markers.length > 0 && (
              <button
                type="button"
                style={{ ...iconBtnStyle, height: 22, padding: '2px 7px', fontSize: 11 }}
                onClick={onClearAll}
              >
                <Trash2 size={12} />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {markers.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.5 }}>
              Select a row and press <code>Ctrl+M</code> (or <code>Ctrl+F2</code>) to add a marker.
              Jump between markers with <code>F2</code> / <code>Shift+F2</code>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {markers.map((m) => {
                const pal = MARKER_PALETTE[m.color ?? 'amber'];
                const isVisible = visibleMarkerRowSet.has(m.row);
                const draft = noteDrafts[m.row] ?? m.note ?? '';
                const preview = getRowPreview(m.row);

                return (
                  <div
                    key={m.row}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '5px 7px',
                      borderRadius: 5,
                      border: `1px solid ${border}`,
                      borderLeft: `4px solid ${pal.bar}`,
                      background: isDark ? '#27272a' : '#f8fafc',
                      opacity: isVisible ? 1 : 0.65,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        title="Cycle marker color"
                        onClick={() => onCycleMarkerColor(m.row)}
                        style={{
                          width: 11,
                          height: 11,
                          padding: 0,
                          borderRadius: '50%',
                          border: '1px solid rgba(128,128,128,0.5)',
                          background: pal.bar,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onJumpToRow(m.row);
                          if (isVisible) setShowList(false);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          border: 'none',
                          background: 'transparent',
                          color: fg,
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 12,
                        }}
                        title={preview}
                      >
                        <strong style={{ flexShrink: 0 }}>#{m.row + 1}</strong>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            opacity: 0.85,
                            fontSize: 11,
                          }}
                        >
                          {preview || '(empty row)'}
                        </span>
                      </button>
                      {!isVisible && (
                        <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }}>
                          (filtered)
                        </span>
                      )}
                      <button
                        type="button"
                        title="Remove marker"
                        onClick={() => onRemoveMarker(m.row)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: fg,
                          opacity: 0.6,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          padding: 2,
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={draft}
                      placeholder="Note..."
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [m.row]: e.target.value }))
                      }
                      onBlur={() => {
                        if (m.row in noteDrafts) {
                          onUpdateMarkerNote(m.row, noteDrafts[m.row]!);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onUpdateMarkerNote(m.row, draft);
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '2px 6px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: `1px solid ${border}`,
                        background: inputBg,
                        color: fg,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
