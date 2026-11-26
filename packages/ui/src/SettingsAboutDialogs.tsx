import React, { useEffect, useMemo, useState } from 'react';
import { X, Settings, Info, ExternalLink } from 'lucide-react';
import type {
  JsonlArrayMode,
  LogParserConfig,
  MarkerColor,
  MetaTextFormat,
} from '@meta-csv/schema';
import { LOG_PRESETS, previewLogPattern } from '@meta-csv/core';
import { MARKER_COLORS, MARKER_PALETTE } from './MarkerControls';
import type { ThemePreference } from './theme';

export type EditorHostMode = 'vscode' | 'desktop' | 'web';

export interface EditorAppSettings {
  defaultFontSize?: number;
  defaultRowHeight?: number;
  defaultMarkerColor?: MarkerColor;
  showRowNumbers?: boolean;
  noHeaderColumnStyle?: 'excel' | 'numbered';
}

export interface FileLayoutSettingsProps {
  format?: MetaTextFormat;
  readOnly: boolean;
  onReadOnlyChange: (next: boolean) => void;
  hasHeader: boolean;
  onHasHeaderChange: (next: boolean) => void;
  jsonlFlattenDepth?: number;
  onJsonlFlattenDepthChange?: (next: number) => void;
  jsonlArrayMode?: JsonlArrayMode;
  onJsonlArrayModeChange?: (next: JsonlArrayMode) => void;
  logLinePattern?: string;
  logColumnNames?: string[];
  logMultilinePattern?: string;
  logWordWrap?: boolean;
  logMatchedPresetId?: string;
  logRegexError?: string;
  logSampleLines?: string[];
  onLogConfigChange?: (patch: Partial<LogParserConfig>) => void;
  freezeColumns: number;
  maxFreezeColumns: number;
  onFreezeColumnsChange: (next: number) => void;
  fontSize: number;
  onFontSizeChange: (next: number) => void;
  defaultRowHeight: number;
  onDefaultRowHeightChange: (next: number) => void;
  columns: Array<{ key: string; label: string; visible: boolean; wrap?: boolean }>;
  onToggleColumnVisible: (key: string, visible: boolean) => void;
  onToggleColumnWrap?: (key: string, wrap: boolean) => void;
}

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  hostMode?: EditorHostMode;
  themeMode: 'light' | 'dark';
  themePreference?: ThemePreference;
  systemTheme?: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  fileSettings?: FileLayoutSettingsProps;
  onOpenHostSettings?: () => void;
  extraSection?: React.ReactNode;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  hostMode = 'web',
  themeMode,
  themePreference,
  systemTheme = 'dark',
  onThemePreferenceChange,
  appSettings,
  onAppSettingsChange,
  fileSettings,
  onOpenHostSettings,
  extraSection,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'app'>(fileSettings ? 'file' : 'app');
  const [draftLinePattern, setDraftLinePattern] = useState(fileSettings?.logLinePattern ?? '');
  const [draftColumnNamesText, setDraftColumnNamesText] = useState(
    (fileSettings?.logColumnNames ?? []).join(', '),
  );
  const [draftMultilinePattern, setDraftMultilinePattern] = useState(
    fileSettings?.logMultilinePattern ?? '',
  );
  const [draftPresetId, setDraftPresetId] = useState(
    fileSettings?.logMatchedPresetId ?? 'custom',
  );

  const hasFileSettings = Boolean(fileSettings);
  const logColumnNamesKey = fileSettings?.logColumnNames?.join(',') ?? '';

  // Reset initial tab only when modal opens (never on parent re-renders / onClose identity changes)
  useEffect(() => {
    if (!open) return;
    setActiveTab(hasFileSettings ? 'file' : 'app');
  }, [open, hasFileSettings]);

  // Sync log parser draft fields when modal opens or file log config changes
  useEffect(() => {
    if (!open) return;
    setDraftLinePattern(fileSettings?.logLinePattern ?? '');
    setDraftColumnNamesText((fileSettings?.logColumnNames ?? []).join(', '));
    setDraftMultilinePattern(fileSettings?.logMultilinePattern ?? '');
    setDraftPresetId(fileSettings?.logMatchedPresetId ?? 'custom');
  }, [
    open,
    fileSettings?.logLinePattern,
    fileSettings?.logMultilinePattern,
    fileSettings?.logMatchedPresetId,
    logColumnNamesKey,
  ]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const draftColumnNames = useMemo(
    () =>
      draftColumnNamesText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [draftColumnNamesText],
  );

  const logPreview = useMemo(() => {
    if (fileSettings?.format !== 'log' && fileSettings?.format !== 'text') return null;
    return previewLogPattern(fileSettings.logSampleLines ?? [], {
      linePattern: draftLinePattern,
      columnNames: draftColumnNames.length > 0 ? draftColumnNames : undefined,
      multilinePattern: draftMultilinePattern.trim() || undefined,
    });
  }, [
    fileSettings?.format,
    fileSettings?.logSampleLines,
    draftLinePattern,
    draftColumnNames,
    draftMultilinePattern,
  ]);

  if (!open) return null;

  const isDark = themeMode === 'dark';
  const bg = isDark ? '#1f1f23' : '#ffffff';
  const border = isDark ? '#3c3c42' : '#cbd5e1';
  const fg = isDark ? '#f1f5f9' : '#0f172a';
  const inputBg = isDark ? '#141416' : '#f8fafc';
  const tabBg = isDark ? '#27272d' : '#f1f5f9';

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${border}`,
    background: inputBg,
    color: fg,
  };

  const tabBtnStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: selected ? 700 : 500,
    borderRadius: 6,
    border: `1px solid ${selected ? '#3b82f6' : 'transparent'}`,
    background: selected ? (isDark ? '#1e3a8a' : '#dbeafe') : 'transparent',
    color: selected ? (isDark ? '#ffffff' : '#1d4ed8') : fg,
    cursor: 'pointer',
  });

  const effectiveTab = fileSettings ? activeTab : 'app';

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '8vh 16px 16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="MetaText Editor Settings"
        style={{
          width: '100%',
          maxWidth:
            fileSettings?.format === 'log' || fileSettings?.format === 'text' ? 540 : 460,
          maxHeight: '84vh',
          overflowY: 'auto',
          borderRadius: 10,
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Settings size={16} />
            <span>Settings</span>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: fg,
              opacity: 0.7,
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {fileSettings && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: 3,
              borderRadius: 7,
              background: tabBg,
              border: `1px solid ${border}`,
            }}
          >
            <button
              type="button"
              style={tabBtnStyle(effectiveTab === 'file')}
              onClick={() => setActiveTab('file')}
            >
              File (.metatext.jsonc)
            </button>
            <button
              type="button"
              style={tabBtnStyle(effectiveTab === 'app')}
              onClick={() => setActiveTab('app')}
            >
              App Settings
            </button>
          </div>
        )}

        {effectiveTab === 'file' && fileSettings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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

                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <span>Word Wrap (Default)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(fileSettings.logWordWrap)}
                    onChange={(e) =>
                      fileSettings.onLogConfigChange?.({ wordWrap: e.target.checked })
                    }
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
                          columnNames:
                            draftColumnNames.length > 0 ? draftColumnNames : undefined,
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
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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
            <div style={{ fontWeight: 600, fontSize: 12 }}>Columns (Show / Wrap)</div>
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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 12 }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 0, flex: 1 }}>
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
                      title={col.wrap ? 'Disable text wrap for this column' : 'Enable text wrap for this column'}
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
        )}

        {effectiveTab === 'app' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {onThemePreferenceChange && themePreference && (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>Theme</span>
                <select
                  value={themePreference}
                  onChange={(e) => onThemePreferenceChange(e.target.value as ThemePreference)}
                  style={inputStyle}
                >
                  <option value="system">System ({systemTheme})</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            )}

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>Default Font Size (px)</span>
              <input
                type="number"
                min={9}
                max={32}
                value={appSettings.defaultFontSize ?? 13}
                onChange={(e) =>
                  onAppSettingsChange?.({
                    defaultFontSize: Math.max(9, Math.min(32, Number(e.target.value) || 13)),
                  })
                }
                style={{ ...inputStyle, width: 76 }}
              />
            </label>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>Default Row Height (px)</span>
              <input
                type="number"
                min={20}
                max={200}
                value={appSettings.defaultRowHeight ?? 28}
                onChange={(e) =>
                  onAppSettingsChange?.({
                    defaultRowHeight: Math.max(20, Math.min(200, Number(e.target.value) || 28)),
                  })
                }
                style={{ ...inputStyle, width: 76 }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>Default Marker Color</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {MARKER_COLORS.map((color) => {
                  const pal = MARKER_PALETTE[color];
                  const active = (appSettings.defaultMarkerColor ?? 'amber') === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      title={pal.label}
                      aria-label={pal.label}
                      onClick={() => onAppSettingsChange?.({ defaultMarkerColor: color })}
                      style={{
                        width: 16,
                        height: 16,
                        padding: 0,
                        borderRadius: '50%',
                        background: pal.bar,
                        border: active
                          ? `2px solid ${isDark ? '#ffffff' : '#0f172a'}`
                          : '1px solid rgba(128,128,128,0.45)',
                        cursor: 'pointer',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>Column Names (No Header)</span>
              <select
                value={appSettings.noHeaderColumnStyle ?? 'excel'}
                onChange={(e) =>
                  onAppSettingsChange?.({
                    noHeaderColumnStyle: e.target.value as 'excel' | 'numbered',
                  })
                }
                style={inputStyle}
              >
                <option value="excel">A, B, C... (Excel)</option>
                <option value="numbered">column 1, 2, 3...</option>
              </select>
            </label>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <span>Show Row Numbers</span>
              <input
                type="checkbox"
                checked={appSettings.showRowNumbers !== false}
                onChange={(e) => onAppSettingsChange?.({ showRowNumbers: e.target.checked })}
              />
            </label>

            {extraSection && (
              <>
                <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '2px 0' }} />
                {extraSection}
              </>
            )}
          </div>
        )}

        {hostMode === 'vscode' && onOpenHostSettings && (
          <>
            <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '0' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  onOpenHostSettings();
                  onClose();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${border}`,
                  background: tabBg,
                  color: fg,
                  cursor: 'pointer',
                }}
              >
                <Settings size={13} />
                <span>VS Code Settings</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  themeMode: 'light' | 'dark';
  hostMode: EditorHostMode;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  open,
  onClose,
  themeMode,
  hostMode,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDark = themeMode === 'dark';
  const bg = isDark ? '#1f1f23' : '#ffffff';
  const border = isDark ? '#3c3c42' : '#cbd5e1';
  const fg = isDark ? '#f1f5f9' : '#0f172a';
  const mutedBg = isDark ? '#27272c' : '#f1f5f9';

  const envLabel =
    hostMode === 'vscode'
      ? 'VS Code Extension'
      : hostMode === 'desktop'
        ? 'Desktop App (Tauri)'
        : 'Web / PWA Edition';

  const shortcuts: Array<[string, string]> = [
    ['Ctrl+M / Ctrl+F2', 'Toggle row marker'],
    ['F2 / Shift+F2', 'Jump to next / previous marker'],
    ['Ctrl+Wheel / Ctrl+0', 'Zoom grid in/out / reset 100%'],
    ['Ctrl+S', 'Save file'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ];

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About MetaText Editor"
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 10,
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Info size={16} />
            <span>About MetaText Editor</span>
          </div>
          <button
            type="button"
            aria-label="Close about"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: fg,
              opacity: 0.7,
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>MetaText Editor</strong>
            <span
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 999,
                background: mutedBg,
                border: `1px solid ${border}`,
              }}
            >
              v0.1.0 · {envLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>
            High-performance CSV, TSV, JSONL &amp; Log editor &amp; viewer powered by <code>.metatext.jsonc</code> sidecar metadata.
          </div>
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: mutedBg,
            border: `1px solid ${border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>Keyboard Shortcuts</div>
          {shortcuts.map(([keys, desc]) => (
            <div
              key={keys}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}
            >
              <span style={{ opacity: 0.85 }}>{desc}</span>
              <code
                style={{
                  fontFamily: "'Consolas', monospace",
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: bg,
                  border: `1px solid ${border}`,
                }}
              >
                {keys}
              </code>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
          <a
            href="https://github.com/mahorobalab/metatext-editor"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3b82f6', textDecoration: 'none' }}
          >
            <span>GitHub</span>
            <ExternalLink size={12} />
          </a>
          <a
            href="https://mahorobalab.github.io/metatext-editor/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3b82f6', textDecoration: 'none' }}
          >
            <span>Website</span>
            <ExternalLink size={12} />
          </a>
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
          Licensed under the MIT License · © 2026 MahorobaLab. The MetaText Editor name and official icons are assets of MahorobaLab.
        </div>
      </div>
    </div>
  );
};
