import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  BookmarkPlus,
  ChevronDown,
  Filter,
  Layers,
  X,
} from 'lucide-react';
import type { FilterPreset } from '@metatext-editor/schema';
import { computeColumnFacets } from '@metatext-editor/core';
import { useInputHistory } from './useInputHistory';

export interface FilterColumnOption {
  index: number;
  key: string;
  label: string;
}

export interface FilterBarProps {
  query: string;
  onQueryChange: (next: string) => void;
  contextRows: number;
  onContextRowsChange: (next: number) => void;
  collapseColKey: string;
  onCollapseColKeyChange: (key: string) => void;
  columns: FilterColumnOption[];
  rows: string[][];
  activeIndices: Int32Array;
  totalRows: number;
  matchedCount: number;
  filterElapsedMs: number;
  filterError?: string;
  presets: FilterPreset[];
  onSavePreset: (preset: FilterPreset) => void;
  onDeletePreset: (name: string) => void;
  onApplyPreset: (preset: FilterPreset) => void;
  extraControls?: React.ReactNode;
  themeMode: 'light' | 'dark';
}

export const FilterBar: React.FC<FilterBarProps> = ({
  query,
  onQueryChange,
  contextRows,
  onContextRowsChange,
  collapseColKey,
  onCollapseColKeyChange,
  columns,
  rows,
  activeIndices,
  totalRows,
  matchedCount,
  filterElapsedMs,
  filterError,
  presets,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
  extraControls,
  themeMode,
}) => {
  const [showFacets, setShowFacets] = useState(false);
  const [facetColIdx, setFacetColIdx] = useState<number>(0);
  const [showPresets, setShowPresets] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [presetName, setPresetName] = useState('');
  const history = useInputHistory('metatext.filterHistory');

  // Auto-record valid filter queries after user pauses typing (1.5s)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || filterError) return;
    const t = window.setTimeout(() => {
      history.push(trimmed);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [query, filterError, history.push]);

  const isDark = themeMode === 'dark';
  const bg = isDark ? '#1f1f22' : '#f1f5f9';
  const border = isDark ? '#3c3c3c' : '#cbd5e1';
  const fg = isDark ? '#e2e8f0' : '#0f172a';
  const inputBg = isDark ? '#141416' : '#ffffff';

  const btnStyle: React.CSSProperties = {
    padding: '3px 8px',
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${border}`,
    background: isDark ? '#2d2d30' : '#ffffff',
    color: fg,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const facetData = useMemo(() => {
    if (!showFacets || columns.length === 0) return null;
    const safeCol = columns[facetColIdx] ? columns[facetColIdx]!.index : columns[0]!.index;
    return computeColumnFacets(rows, activeIndices, safeCol, 20);
  }, [showFacets, facetColIdx, columns, rows, activeIndices]);

  const appendFacetToken = (colKey: string, value: string, negate: boolean) => {
    const safeVal = /\s/.test(value) ? `"${value}"` : value;
    const token = `${negate ? '-' : ''}${colKey}:=${safeVal}`;
    const trimmed = query.trim();
    onQueryChange(trimmed ? `${trimmed} ${token}` : token);
  };

  const isFiltering = query.trim().length > 0 || collapseColKey !== '';

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history.items;
    return history.items.filter(
      (item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q,
    );
  }, [history.items, query]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        background: bg,
        borderBottom: `1px solid ${border}`,
        color: fg,
        fontSize: 12,
        flexWrap: 'wrap',
        position: 'relative',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 600,
          opacity: 0.85,
        }}
      >
        <Filter size={13} />
        <span>Filter:</span>
      </span>

      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          flex: '1 1 260px',
          minWidth: 180,
          maxWidth: 540,
        }}
      >
        <input
          type="text"
          value={query}
          onFocus={() => {
            if (history.items.length > 0) {
              setShowHistory(true);
              setShowFacets(false);
              setShowPresets(false);
            }
          }}
          onBlur={() => setShowHistory(false)}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (history.items.length > 0) setShowHistory(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowHistory(false);
            } else if (e.key === 'Enter' && query.trim() && !filterError) {
              history.push(query);
              setShowHistory(false);
            }
          }}
          placeholder="status:blocked OR status:review -owner:suzuki amount:>50000"
          style={{
            width: '100%',
            padding: '4px 44px 4px 8px',
            fontSize: 12,
            fontFamily: "'Consolas', 'Courier New', monospace",
            borderRadius: 4,
            border: `1px solid ${filterError ? '#ef4444' : border}`,
            background: inputBg,
            color: fg,
          }}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => onQueryChange('')}
            style={{
              position: 'absolute',
              right: 22,
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
        )}
        <button
          type="button"
          title="Filter history"
          onClick={() => {
            setShowHistory((s) => !s);
            setShowFacets(false);
            setShowPresets(false);
          }}
          style={{
            position: 'absolute',
            right: 3,
            border: 'none',
            background: 'transparent',
            color: fg,
            opacity: history.items.length > 0 ? 0.75 : 0.35,
            cursor: 'pointer',
            display: 'inline-flex',
            padding: 3,
          }}
        >
          <ChevronDown size={12} />
        </button>

        {showHistory && (filteredHistory.length > 0 || query.trim().length === 0) && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              top: 'calc(100% + 2px)',
              left: 0,
              right: 0,
              zIndex: 50,
              maxHeight: 260,
              overflowY: 'auto',
              padding: 8,
              borderRadius: 6,
              background: isDark ? '#1f1f23' : '#ffffff',
              border: `1px solid ${border}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <strong style={{ fontSize: 11 }}>
                Filter History ({filteredHistory.length}/{history.items.length})
              </strong>
              {history.items.length > 0 && (
                <button
                  type="button"
                  style={{ ...btnStyle, padding: '1px 6px', fontSize: 11 }}
                  onClick={() => history.clear()}
                >
                  Clear History
                </button>
              )}
            </div>
            {filteredHistory.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.65 }}>No history yet.</div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: isDark ? '#27272a' : '#f8fafc',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      fontFamily: "'Consolas', monospace",
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item}
                    onClick={() => {
                      onQueryChange(item);
                      setShowHistory(false);
                    }}
                  >
                    {item}
                  </span>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => history.remove(item)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: fg,
                      opacity: 0.55,
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '0 3px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* grep -C context rows */}
      <label
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Show N rows before & after each match (grep -C)"
      >
        <span style={{ opacity: 0.8 }}>Context ±</span>
        <input
          type="number"
          min={0}
          max={50}
          value={contextRows}
          onChange={(e) =>
            onContextRowsChange(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
          }
          style={{
            width: 44,
            padding: '2px 4px',
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: inputBg,
            color: fg,
          }}
        />
      </label>

      {/* Consecutive duplicate collapse */}
      <label
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Collapse consecutive duplicate values in a column (non-destructive)"
      >
        <Layers size={13} style={{ opacity: 0.8 }} />
        <select
          aria-label="Collapse consecutive duplicates"
          value={collapseColKey}
          onChange={(e) => onCollapseColKeyChange(e.target.value)}
          style={{
            padding: '3px 6px',
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: inputBg,
            color: fg,
            maxWidth: 130,
          }}
        >
          <option value="">Collapse: Off</option>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {/* Facet Ranking Popover Toggle */}
      <button
        type="button"
        style={{
          ...btnStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderColor: showFacets ? '#3b82f6' : border,
        }}
        onClick={() => {
          setShowFacets((s) => !s);
          setShowPresets(false);
        }}
      >
        <BarChart2 size={13} />
        <span>Facets</span>
      </button>

      {/* Presets Popover Toggle */}
      <button
        type="button"
        style={{
          ...btnStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderColor: showPresets ? '#3b82f6' : border,
        }}
        onClick={() => {
          setShowPresets((s) => !s);
          setShowFacets(false);
        }}
      >
        <BookmarkPlus size={13} />
        <span>Presets ({presets.length})</span>
      </button>

      {extraControls && (
        <>
          <span style={{ opacity: 0.35 }}>|</span>
          {extraControls}
        </>
      )}

      {/* Result stats / error */}
      <div style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.8 }}>
        {filterError ? (
          <span style={{ color: '#ef4444' }}>{filterError}</span>
        ) : isFiltering ? (
          <span>
            {activeIndices.length.toLocaleString()} shown
            {contextRows > 0 ? ` (${matchedCount.toLocaleString()} hits)` : ''} /{' '}
            {totalRows.toLocaleString()} ({filterElapsedMs} ms)
          </span>
        ) : (
          <span>Tip: col:val, OR, -not, &gt;100, /regex/</span>
        )}
      </div>

      {/* Facets Popover */}
      {showFacets && columns.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 10,
            zIndex: 45,
            width: 360,
            maxHeight: 420,
            overflowY: 'auto',
            padding: 12,
            borderRadius: 6,
            background: isDark ? '#1f1f23' : '#ffffff',
            border: `1px solid ${border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong>Value Frequency (Top 20)</strong>
            <select
              value={facetColIdx}
              onChange={(e) => setFacetColIdx(Number(e.target.value))}
              style={{
                padding: '3px 6px',
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${border}`,
                background: inputBg,
                color: fg,
              }}
            >
              {columns.map((c, idx) => (
                <option key={c.key} value={idx}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {facetData && (
            <>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {facetData.uniqueCount.toLocaleString()} unique values across{' '}
                {facetData.totalCount.toLocaleString()} rows
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {facetData.entries.map((entry) => {
                  const pct =
                    facetData.totalCount > 0
                      ? Math.round((entry.count / facetData.totalCount) * 1000) / 10
                      : 0;
                  const colKey = columns[facetColIdx]?.key ?? columns[0]!.key;
                  return (
                    <div
                      key={entry.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                      }}
                    >
                      <button
                        style={{ ...btnStyle, padding: '1px 5px', fontSize: 11 }}
                        title="Include this value"
                        onClick={() => appendFacetToken(colKey, entry.value, false)}
                      >
                        +
                      </button>
                      <button
                        style={{ ...btnStyle, padding: '1px 5px', fontSize: 11 }}
                        title="Exclude this value"
                        onClick={() => appendFacetToken(colKey, entry.value, true)}
                      >
                        -
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={entry.value || '(empty)'}
                          >
                            {entry.value || '(empty)'}
                          </span>
                          <span style={{ opacity: 0.75, flexShrink: 0 }}>
                            {entry.count.toLocaleString()} ({pct}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: 4,
                            marginTop: 2,
                            borderRadius: 2,
                            background: isDark ? '#333338' : '#e2e8f0',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(2, pct)}%`,
                              height: '100%',
                              background: '#3b82f6',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Presets Popover */}
      {showPresets && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 10,
            zIndex: 45,
            width: 340,
            maxHeight: 360,
            overflowY: 'auto',
            padding: 12,
            borderRadius: 6,
            background: isDark ? '#1f1f23' : '#ffffff',
            border: `1px solid ${border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <strong>Filter Presets (.metatext.jsonc)</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${border}`,
                background: inputBg,
                color: fg,
              }}
            />
            <button
              style={btnStyle}
              disabled={!presetName.trim() || !isFiltering}
              onClick={() => {
                onSavePreset({
                  name: presetName.trim(),
                  query: query.trim(),
                  ...(contextRows > 0 ? { contextRows } : {}),
                  ...(collapseColKey ? { collapseColumn: collapseColKey } : {}),
                });
                setPresetName('');
              }}
            >
              Save
            </button>
          </div>

          {presets.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              No presets yet. Enter a filter query and save it here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {presets.map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: `1px solid ${border}`,
                  }}
                >
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => {
                      onApplyPreset(p);
                      setShowPresets(false);
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.75,
                        fontFamily: "'Consolas', monospace",
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.query}
                      {p.contextRows ? ` (±${p.contextRows})` : ''}
                      {p.collapseColumn ? ` [collapse:${p.collapseColumn}]` : ''}
                    </div>
                  </div>
                  <button
                    style={{ ...btnStyle, padding: '2px 6px' }}
                    title="Delete preset"
                    onClick={() => onDeletePreset(p.name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
