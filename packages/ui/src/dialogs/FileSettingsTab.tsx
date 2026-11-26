import React, { useEffect, useMemo, useState } from 'react';
import type { JsonlArrayMode } from '@metatext-editor/schema';
import { LOG_PRESETS, previewLogPattern } from '@metatext-editor/core';
import type { EditorAppSettings, FileLayoutSettingsProps } from './types';

export interface FileSettingsTabProps {
  open: boolean;
  isDark: boolean;
  border: string;
  fg: string;
  inputBg: string;
  inputStyle: React.CSSProperties;
  fileSettings: FileLayoutSettingsProps;
  appSettings: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
}

export const FileSettingsTab: React.FC<FileSettingsTabProps> = ({
  open,
  isDark,
  border,
  fg,
  inputBg,
  inputStyle,
  fileSettings,
  appSettings,
  onAppSettingsChange,
}) => {
  const [draftLinePattern, setDraftLinePattern] = useState(fileSettings.logLinePattern ?? '');
  const [draftColumnNamesText, setDraftColumnNamesText] = useState(
    (fileSettings.logColumnNames ?? []).join(', '),
  );
  const [draftMultilinePattern, setDraftMultilinePattern] = useState(
    fileSettings.logMultilinePattern ?? '',
  );
  const [draftPresetId, setDraftPresetId] = useState(
    fileSettings.logMatchedPresetId ?? 'custom',
  );

  const logColumnNamesKey = fileSettings.logColumnNames?.join(',') ?? '';

  useEffect(() => {
    if (!open) return;
    setDraftLinePattern(fileSettings.logLinePattern ?? '');
    setDraftColumnNamesText((fileSettings.logColumnNames ?? []).join(', '));
    setDraftMultilinePattern(fileSettings.logMultilinePattern ?? '');
    setDraftPresetId(fileSettings.logMatchedPresetId ?? 'custom');
  }, [
    open,
    fileSettings.logLinePattern,
    fileSettings.logMultilinePattern,
    fileSettings.logMatchedPresetId,
    logColumnNamesKey,
  ]);

  const draftColumnNames = useMemo(
    () =>
      draftColumnNamesText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [draftColumnNamesText],
  );

  const logPreview = useMemo(() => {
    if (fileSettings.format !== 'log' && fileSettings.format !== 'text') return null;
    return previewLogPattern(fileSettings.logSampleLines ?? [], {
      linePattern: draftLinePattern,
      columnNames: draftColumnNames.length > 0 ? draftColumnNames : undefined,
      multilinePattern: draftMultilinePattern.trim() || undefined,
    });
  }, [
    fileSettings.format,
    fileSettings.logSampleLines,
    draftLinePattern,
    draftColumnNames,
    draftMultilinePattern,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <label
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <span>Read-Only Mode (Protect Source Data)</span>
        <input
          type="checkbox"
          checked={fileSettings.readOnly}
          onChange={(e) => fileSettings.onReadOnlyChange(e.target.checked)}
        />
      </label>

      {fileSettings.format === 'jsonl' ? (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>JSONL Flatten Depth (0-8)</span>
            <input
              type="number"
              min={0}
              max={8}
              value={fileSettings.jsonlFlattenDepth ?? 2}
              onChange={(e) =>
                fileSettings.onJsonlFlattenDepthChange?.(
                  Math.max(0, Math.min(8, Math.floor(Number(e.target.value) || 0))),
                )
              }
              style={{ ...inputStyle, width: 76 }}
            />
          </label>

          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>JSONL Array Display</span>
            <select
              value={fileSettings.jsonlArrayMode ?? 'json'}
              onChange={(e) =>
                fileSettings.onJsonlArrayModeChange?.(e.target.value as JsonlArrayMode)
              }
              style={inputStyle}
            >
              <option value="json">Compact JSON ([...])</option>
              <option value="join">Comma-joined (a, b)</option>
            </select>
          </label>
        </>
      ) : fileSettings.format === 'log' || fileSettings.format === 'text' ? (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>Log Format Preset</span>
            <select
              value={draftPresetId}
              onChange={(e) => {
                const nextId = e.target.value;
                setDraftPresetId(nextId);
                const preset = LOG_PRESETS.find((p) => p.id === nextId);
                if (preset) {
                  setDraftLinePattern(preset.linePattern);
                  setDraftColumnNamesText(preset.columnNames.join(', '));
                  setDraftMultilinePattern(preset.multilinePattern ?? '');
                }
              }}
              style={inputStyle}
            >
              {LOG_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="iis-w3c">IIS W3C (#Fields: Auto)</option>
              <option value="docker-json">Docker / JSON Log (Auto)</option>
              <option value="custom">Custom Pattern</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Line Pattern (Regex — named or numbered captures)</span>
            <input
              type="text"
              value={draftLinePattern}
              onChange={(e) => {
                setDraftLinePattern(e.target.value);
                setDraftPresetId('custom');
              }}
              placeholder="Empty = plain lines (single message column)"
              style={{
                ...inputStyle,
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontSize: 11.5,
              }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>Column Names (numbered fallback)</span>
              <input
                type="text"
                value={draftColumnNamesText}
                onChange={(e) => setDraftColumnNamesText(e.target.value)}
                placeholder="timestamp, level, message"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>Multiline Continuation Regex</span>
              <input
                type="text"
                value={draftMultilinePattern}
                onChange={(e) => setDraftMultilinePattern(e.target.value)}
                placeholder="^(\s+at\s+|Caused by:)"
                style={{
                  ...inputStyle,
                  fontFamily: "'Consolas', 'Courier New', monospace",
                  fontSize: 11.5,
                }}
              />
            </label>
          </div>

          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <span>Word Wrap (Default)</span>
            <input
              type="checkbox"
              checked={Boolean(fileSettings.logWordWrap)}
              onChange={(e) => fileSettings.onLogConfigChange?.({ wordWrap: e.target.checked })}
            />
          </label>

          {logPreview && (
            <div
              style={{
                padding: 8,
                borderRadius: 6,
                background: inputBg,
                border: `1px solid ${border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 11.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Live Preview</strong>
                <span style={{ opacity: 0.75 }}>
                  Matched {logPreview.matchedEntries}/{logPreview.totalEntries} sample entries
                </span>
              </div>
              {(logPreview.error || fileSettings.logRegexError) && (
                <div style={{ color: '#f43f5e', fontSize: 11 }}>
                  {logPreview.error ?? fileSettings.logRegexError}
                </div>
              )}
              {logPreview.rows.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: 115 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {logPreview.columns.map((col) => (
                          <th
                            key={col}
                            style={{
                              textAlign: 'left',
                              padding: '2px 6px',
                              borderBottom: `1px solid ${border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logPreview.rows.slice(0, 4).map((r, ri) => (
                        <tr key={ri}>
                          {logPreview.columns.map((_, ci) => (
                            <td
                              key={ci}
                              style={{
                                padding: '2px 6px',
                                borderBottom: `1px solid ${border}`,
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {r[ci] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {fileSettings.onLogConfigChange && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  const preset = LOG_PRESETS.find((p) => p.id === draftPresetId);
                  fileSettings.onLogConfigChange?.({
                    linePattern: draftLinePattern,
                    columnNames: draftColumnNames.length > 0 ? draftColumnNames : undefined,
                    multilinePattern: draftMultilinePattern.trim() || undefined,
                    timestampColumn: preset?.timestampColumn,
                    levelColumn: preset?.levelColumn,
                  });
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid #3b82f6',
                  background: '#2563eb',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Apply Log Parser
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <span>First Row is Header</span>
            <input
              type="checkbox"
              checked={fileSettings.hasHeader}
              onChange={(e) => fileSettings.onHasHeaderChange(e.target.checked)}
            />
          </label>

          {!fileSettings.hasHeader && onAppSettingsChange && (
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>Column Names (No Header)</span>
              <select
                value={appSettings.noHeaderColumnStyle ?? 'excel'}
                onChange={(e) =>
                  onAppSettingsChange({
                    noHeaderColumnStyle: e.target.value as 'excel' | 'numbered',
                  })
                }
                style={inputStyle}
              >
                <option value="excel">A, B, C... (Excel)</option>
                <option value="numbered">column 1, 2, 3...</option>
              </select>
            </label>
          )}
        </>
      )}

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Freeze Columns</span>
        <input
          type="number"
          min={0}
          max={fileSettings.maxFreezeColumns}
          value={fileSettings.freezeColumns}
          onChange={(e) =>
            fileSettings.onFreezeColumnsChange(Math.max(0, Number(e.target.value) || 0))
          }
          style={{ ...inputStyle, width: 76 }}
        />
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Font Size (px)</span>
        <input
          type="number"
          min={9}
          max={32}
          value={fileSettings.fontSize}
          onChange={(e) =>
            fileSettings.onFontSizeChange(
              Math.max(9, Math.min(32, Number(e.target.value) || 13)),
            )
          }
          style={{ ...inputStyle, width: 76 }}
        />
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Row Height (px)</span>
        <input
          type="number"
          min={20}
          max={200}
          value={fileSettings.defaultRowHeight}
          onChange={(e) =>
            fileSettings.onDefaultRowHeightChange(
              Math.max(20, Math.min(200, Number(e.target.value) || 28)),
            )
          }
          style={{ ...inputStyle, width: 76 }}
        />
      </label>

      <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '2px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>Columns (Show / Wrap)</div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11.5,
            fontWeight: 400,
            cursor: 'pointer',
            opacity: 0.85,
          }}
          title="列を非表示にするときに確認ダイアログを表示する"
        >
          <input
            type="checkbox"
            checked={appSettings.confirmHideColumn !== false}
            onChange={(e) => onAppSettingsChange?.({ confirmHideColumn: e.target.checked })}
          />
          <span>確認表示</span>
        </label>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 6,
          maxHeight: 170,
          overflowY: 'auto',
          padding: 8,
          borderRadius: 6,
          background: inputBg,
          border: `1px solid ${border}`,
        }}
      >
        {fileSettings.columns.map((col) => (
          <div
            key={col.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              fontSize: 12,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                minWidth: 0,
                flex: 1,
              }}
            >
              <input
                type="checkbox"
                checked={col.visible}
                onChange={(e) => fileSettings.onToggleColumnVisible(col.key, e.target.checked)}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {col.label}
              </span>
            </label>
            {fileSettings.onToggleColumnWrap && (
              <button
                type="button"
                title={
                  col.wrap ? 'Disable text wrap for this column' : 'Enable text wrap for this column'
                }
                onClick={() => fileSettings.onToggleColumnWrap?.(col.key, !col.wrap)}
                style={{
                  padding: '1px 5px',
                  fontSize: 10.5,
                  borderRadius: 4,
                  border: `1px solid ${col.wrap ? '#3b82f6' : border}`,
                  background: col.wrap ? (isDark ? '#1e3a8a' : '#dbeafe') : 'transparent',
                  color: col.wrap ? (isDark ? '#ffffff' : '#1d4ed8') : fg,
                  opacity: col.wrap ? 1 : 0.6,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Wrap
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
