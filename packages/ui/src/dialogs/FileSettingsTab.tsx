import React, { useEffect, useMemo, useState } from 'react';
import type { JsonlArrayMode } from '@metatext-editor/schema';
import { LOG_PRESETS, previewLogPattern } from '@metatext-editor/core';
import { useI18n } from '../i18n';
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
  const { t } = useI18n();
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
        <span>{t('fileSettings.readOnly')}</span>
        <input
          type="checkbox"
          checked={fileSettings.readOnly}
          onChange={(e) => fileSettings.onReadOnlyChange(e.target.checked)}
        />
      </label>

      {fileSettings.format === 'jsonl' ? (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>{t('fileSettings.jsonlFlattenDepth')}</span>
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
            <span>{t('fileSettings.jsonlArrayDisplay')}</span>
            <select
              value={fileSettings.jsonlArrayMode ?? 'json'}
              onChange={(e) =>
                fileSettings.onJsonlArrayModeChange?.(e.target.value as JsonlArrayMode)
              }
              style={inputStyle}
            >
              <option value="json">{t('fileSettings.jsonlArrayJson')}</option>
              <option value="join">{t('fileSettings.jsonlArrayJoin')}</option>
            </select>
          </label>
        </>
      ) : fileSettings.format === 'log' || fileSettings.format === 'text' ? (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>{t('fileSettings.logPreset')}</span>
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
              <option value="iis-w3c">{t('fileSettings.logPresetIis')}</option>
              <option value="docker-json">{t('fileSettings.logPresetDocker')}</option>
              <option value="custom">{t('fileSettings.logPresetCustom')}</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{t('fileSettings.logLinePattern')}</span>
            <input
              type="text"
              value={draftLinePattern}
              onChange={(e) => {
                setDraftLinePattern(e.target.value);
                setDraftPresetId('custom');
              }}
              placeholder={t('fileSettings.logLinePatternPlaceholder')}
              style={{
                ...inputStyle,
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontSize: 11.5,
              }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>{t('fileSettings.logColNames')}</span>
              <input
                type="text"
                value={draftColumnNamesText}
                onChange={(e) => setDraftColumnNamesText(e.target.value)}
                placeholder="timestamp, level, message"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>{t('fileSettings.logMultilinePattern')}</span>
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
            <span>{t('fileSettings.logWordWrap')}</span>
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
                <strong>{t('fileSettings.logPreviewTitle')}</strong>
                <span style={{ opacity: 0.75 }}>
                  {t('fileSettings.logPreviewMatched', {
                    matched: logPreview.matchedEntries,
                    total: logPreview.totalEntries,
                  })}
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
                {t('fileSettings.logApply')}
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
            <span>{t('fileSettings.hasHeader')}</span>
            <input
              type="checkbox"
              checked={fileSettings.hasHeader}
              onChange={(e) => fileSettings.onHasHeaderChange(e.target.checked)}
            />
          </label>

          {!fileSettings.hasHeader && onAppSettingsChange && (
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{t('appSettings.noHeaderColStyle')}</span>
              <select
                value={appSettings.noHeaderColumnStyle ?? 'excel'}
                onChange={(e) =>
                  onAppSettingsChange({
                    noHeaderColumnStyle: e.target.value as 'excel' | 'numbered',
                  })
                }
                style={inputStyle}
              >
                <option value="excel">{t('appSettings.colStyleExcel')}</option>
                <option value="numbered">{t('appSettings.colStyleNumbered')}</option>
              </select>
            </label>
          )}
        </>
      )}

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>{t('fileSettings.freezeColumns')}</span>
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
        <span>{t('fileSettings.fontSize')}</span>
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
        <span>{t('fileSettings.rowHeight')}</span>
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
        <div style={{ fontWeight: 600, fontSize: 12 }}>{t('fileSettings.columnsTitle')}</div>
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
          title={t('fileSettings.confirmHideColTooltip')}
        >
          <input
            type="checkbox"
            checked={appSettings.confirmHideColumn !== false}
            onChange={(e) => onAppSettingsChange?.({ confirmHideColumn: e.target.checked })}
          />
          <span>{t('fileSettings.confirmHideCol')}</span>
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
                  col.wrap
                    ? t('fileSettings.disableWrapTooltip')
                    : t('fileSettings.enableWrapTooltip')
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
                {t('common.wrap')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
