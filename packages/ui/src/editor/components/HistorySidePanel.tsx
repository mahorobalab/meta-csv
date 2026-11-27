import React, { useState } from 'react';
import {
  Clock,
  GitCommitHorizontal,
  History,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  HistoryEntrySummary,
  HistorySnapshotMeta,
  TableCellDiffResult,
} from '@metatext-editor/core';

export interface HistorySidePanelProps {
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  /** Layer 1: in-memory action history */
  actionEntries: HistoryEntrySummary[];
  actionCursor: number;
  onJumpToActionCursor: (cursor: number) => void;
  /** Layer 2: Shadow Git saved snapshots */
  hasSnapshotBackend: boolean;
  historyRecordingEnabled: boolean;
  snapshots: HistorySnapshotMeta[];
  loadingSnapshots: boolean;
  savingSnapshot: boolean;
  activeSnapshotId: string | null;
  storageUsageBytes: number | null;
  diffBySnapshotId: Record<string, TableCellDiffResult | null>;
  loadingDiffId: string | null;
  onRefreshSnapshots: () => void;
  onRestoreSnapshot: (snap: HistorySnapshotMeta) => void;
  onToggleSnapshotDiff: (snap: HistorySnapshotMeta) => void;
  onClose: () => void;
}

function formatActionTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const HistorySidePanel: React.FC<HistorySidePanelProps> = ({
  isDark,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  actionEntries,
  actionCursor,
  onJumpToActionCursor,
  hasSnapshotBackend,
  historyRecordingEnabled,
  snapshots,
  loadingSnapshots,
  savingSnapshot,
  activeSnapshotId,
  storageUsageBytes,
  diffBySnapshotId,
  loadingDiffId,
  onRefreshSnapshots,
  onRestoreSnapshot,
  onToggleSnapshotDiff,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'snapshots'>('actions');

  const panelBg = isDark ? '#18181b' : '#f8fafc';
  const itemHoverBg = isDark ? '#27272a' : '#e2e8f0';
  const activeBg = isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.14)';
  const mutedFg = isDark ? '#a1a1aa' : '#64748b';
  const monoFont = "'Consolas', 'Courier New', monospace";

  const tabBtnStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 8px',
    fontSize: 11.5,
    fontWeight: selected ? 600 : 500,
    border: 'none',
    borderBottom: selected ? '2px solid #3b82f6' : '2px solid transparent',
    background: 'transparent',
    color: selected ? toolbarFg : mutedFg,
    cursor: 'pointer',
  });

  return (
    <aside
      style={{
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${toolbarBorder}`,
        background: panelBg,
        color: toolbarFg,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          borderBottom: `1px solid ${toolbarBorder}`,
          background: toolbarBg,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <History size={13} />
          <span>History</span>
          {savingSnapshot && (
            <span style={{ fontSize: 10.5, fontWeight: 400, color: mutedFg }}>saving...</span>
          )}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {activeTab === 'snapshots' && hasSnapshotBackend && (
            <button
              type="button"
              title="Refresh snapshots"
              onClick={onRefreshSnapshots}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                padding: 0,
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: toolbarFg,
                opacity: 0.8,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
          <button
            type="button"
            aria-label="Close history panel"
            title="Close"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: toolbarFg,
              opacity: 0.75,
              cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tabs: Actions (Layer 1) vs Snapshots (Layer 2) */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${toolbarBorder}`,
          background: toolbarBg,
        }}
      >
        <button
          type="button"
          style={tabBtnStyle(activeTab === 'actions')}
          onClick={() => setActiveTab('actions')}
        >
          <RotateCcw size={12} />
          <span>Actions ({actionEntries.length})</span>
        </button>
        <button
          type="button"
          style={tabBtnStyle(activeTab === 'snapshots')}
          onClick={() => setActiveTab('snapshots')}
        >
          <GitCommitHorizontal size={13} />
          <span>Snapshots ({snapshots.length})</span>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {activeTab === 'actions' ? (
          <>
            <button
              type="button"
              onClick={() => onJumpToActionCursor(0)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 5,
                border: `1px solid ${actionCursor === 0 ? '#3b82f6' : 'transparent'}`,
                background: actionCursor === 0 ? activeBg : 'transparent',
                color: toolbarFg,
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: actionCursor === 0 ? 600 : 400 }}>Initial state</span>
              <span style={{ fontFamily: monoFont, fontSize: 10.5, color: mutedFg }}>#0</span>
            </button>

            {actionEntries.map((entry) => {
              const isCurrent = entry.index === actionCursor;
              const isFuture = entry.index > actionCursor;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onJumpToActionCursor(entry.index)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 5,
                    border: `1px solid ${isCurrent ? '#3b82f6' : 'transparent'}`,
                    background: isCurrent ? activeBg : 'transparent',
                    color: toolbarFg,
                    opacity: isFuture ? 0.45 : 1,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = itemHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span
                      style={{
                        fontWeight: isCurrent ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.label}
                    </span>
                    <span style={{ fontFamily: monoFont, fontSize: 10.5, color: mutedFg, flexShrink: 0 }}>
                      {formatActionTime(entry.timestamp)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: monoFont }}>
                    <span style={{ color: mutedFg }}>#{entry.index}</span>
                    {entry.touchesData && (
                      <span
                        style={{
                          padding: '0 4px',
                          borderRadius: 3,
                          background: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.14)',
                          color: isDark ? '#6ee7b7' : '#047857',
                        }}
                      >
                        DATA
                      </span>
                    )}
                    {entry.touchesMeta && (
                      <span
                        style={{
                          padding: '0 4px',
                          borderRadius: 3,
                          background: isDark ? 'rgba(139, 92, 246, 0.22)' : 'rgba(139, 92, 246, 0.14)',
                          color: isDark ? '#c4b5fd' : '#6d28d9',
                        }}
                      >
                        META
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {actionEntries.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 11.5, color: mutedFg, textAlign: 'center' }}>
                Edits in this session appear here. Click any step to jump back without saving.
              </div>
            )}
          </>
        ) : (
          <>
            {!historyRecordingEnabled && (
              <div
                style={{
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${toolbarBorder}`,
                  fontSize: 11,
                  color: mutedFg,
                  marginBottom: 4,
                }}
              >
                Snapshot recording is OFF in Settings. In-memory Undo/Redo remains active.
              </div>
            )}

            {!hasSnapshotBackend && (
              <div style={{ padding: '16px 8px', fontSize: 11.5, color: mutedFg, textAlign: 'center' }}>
                Save this file to enable persistent Shadow Git snapshots.
              </div>
            )}

            {hasSnapshotBackend && loadingSnapshots && snapshots.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 11.5, color: mutedFg, textAlign: 'center' }}>
                Loading snapshots...
              </div>
            )}

            {hasSnapshotBackend && !loadingSnapshots && snapshots.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 11.5, color: mutedFg, textAlign: 'center' }}>
                No snapshots yet. Press Ctrl+S to record a snapshot.
              </div>
            )}

            {snapshots.map((snap) => {
              const isCurrent = snap.id === activeSnapshotId;
              const diff = diffBySnapshotId[snap.id];
              const isDiffOpen = diff !== undefined;
              return (
                <div
                  key={snap.id}
                  style={{
                    borderRadius: 6,
                    border: `1px solid ${isCurrent ? '#3b82f6' : toolbarBorder}`,
                    background: isCurrent ? activeBg : isDark ? '#141416' : '#ffffff',
                    padding: '7px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(snap)}
                    title="Click to preview this snapshot in editor (Ctrl+S to persist)"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      width: '100%',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: toolbarFg,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span
                        style={{
                          fontFamily: monoFont,
                          fontSize: 11,
                          fontWeight: 700,
                          color: isDark ? '#60a5fa' : '#2563eb',
                        }}
                      >
                        {snap.shortId}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontFamily: monoFont,
                          fontSize: 10.5,
                          color: mutedFg,
                        }}
                      >
                        <Clock size={10} />
                        <span>{formatSnapshotTime(snap.timestamp)}</span>
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {snap.message}
                    </div>
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      fontSize: 10.5,
                      fontFamily: monoFont,
                      color: mutedFg,
                    }}
                  >
                    <span>
                      {snap.includesData && snap.dataBytes !== undefined
                        ? `data ${formatBytes(snap.dataBytes)} · meta ${formatBytes(snap.metaBytes)}`
                        : `meta only (${formatBytes(snap.metaBytes)})`}
                    </span>
                    {snap.includesData && (
                      <button
                        type="button"
                        onClick={() => onToggleSnapshotDiff(snap)}
                        style={{
                          padding: '1px 6px',
                          fontSize: 10.5,
                          fontFamily: monoFont,
                          borderRadius: 4,
                          border: `1px solid ${toolbarBorder}`,
                          background: 'transparent',
                          color: toolbarFg,
                          cursor: 'pointer',
                        }}
                      >
                        {loadingDiffId === snap.id ? '...' : isDiffOpen ? 'Hide diff' : 'Diff'}
                      </button>
                    )}
                  </div>

                  {isDiffOpen && diff && (
                    <div
                      style={{
                        marginTop: 3,
                        padding: '5px 6px',
                        borderRadius: 4,
                        background: isDark ? '#0f172a' : '#f1f5f9',
                        fontFamily: monoFont,
                        fontSize: 10.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <div style={{ color: mutedFg }}>
                        vs current ({diff.matchStrategy}): {diff.summary.changedCells} cells, +
                        {diff.summary.addedRows}/-{diff.summary.removedRows} rows
                        {diff.truncated ? ' (truncated)' : ''}
                      </div>
                      {diff.cellChanges.slice(0, 8).map((c, idx) => (
                        <div
                          key={`${c.rowKey}:${c.colKey}:${idx}`}
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={`${c.rowKey}.${c.colKey}: "${c.before}" → "${c.after}"`}
                        >
                          <span style={{ color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                            {c.rowKey}.{c.colKey}
                          </span>
                          : <span style={{ color: '#ef4444' }}>{c.before || '∅'}</span> →{' '}
                          <span style={{ color: '#10b981' }}>{c.after || '∅'}</span>
                        </div>
                      ))}
                      {diff.cellChanges.length === 0 &&
                        diff.addedRows.length === 0 &&
                        diff.removedRows.length === 0 && (
                          <div style={{ color: mutedFg }}>No cell differences vs current view</div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      {activeTab === 'snapshots' && storageUsageBytes !== null && (
        <div
          style={{
            padding: '5px 10px',
            borderTop: `1px solid ${toolbarBorder}`,
            fontSize: 10.5,
            fontFamily: monoFont,
            color: mutedFg,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Shadow Git</span>
          <span>{formatBytes(storageUsageBytes)}</span>
        </div>
      )}
    </aside>
  );
};
