import React from 'react';
import { MARKER_COLORS, MARKER_PALETTE } from '../MarkerControls';
import {
  LOCALE_OPTIONS,
  getLocaleNativeName,
  useI18n,
  type LanguagePreference,
} from '../i18n';
import type { ThemePreference } from '../theme';
import type { EditorAppSettings, EditorHostMode } from './types';
import { DialogSwitchRow } from './ui/DialogPrimitives';

export interface AppSettingsTabProps {
  hostMode: EditorHostMode;
  isDark: boolean;
  border: string;
  inputStyle: React.CSSProperties;
  themePreference?: ThemePreference;
  systemTheme: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  extraSection?: React.ReactNode;
}

export const AppSettingsTab: React.FC<AppSettingsTabProps> = ({
  hostMode,
  isDark,
  border,
  inputStyle,
  themePreference,
  systemTheme,
  onThemePreferenceChange,
  appSettings,
  onAppSettingsChange,
  extraSection,
}) => {
  const { t, systemLocale } = useI18n();
  const systemThemeLabel =
    systemTheme === 'dark' ? t('appSettings.themeDark') : t('appSettings.themeLight');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>{t('appSettings.language')}</span>
        <select
          value={appSettings.language ?? 'auto'}
          onChange={(e) =>
            onAppSettingsChange?.({
              language: e.target.value as LanguagePreference,
            })
          }
          style={inputStyle}
        >
          <option value="auto">
            {t('appSettings.languageAuto', { lang: getLocaleNativeName(systemLocale) })}
          </option>
          {LOCALE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.nativeName}
            </option>
          ))}
        </select>
      </label>

      {onThemePreferenceChange && themePreference && (
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{t('appSettings.theme')}</span>
          <select
            value={themePreference}
            onChange={(e) => onThemePreferenceChange(e.target.value as ThemePreference)}
            style={inputStyle}
          >
            <option value="system">
              {t('appSettings.themeSystem', { theme: systemThemeLabel })}
            </option>
            <option value="light">{t('appSettings.themeLight')}</option>
            <option value="dark">{t('appSettings.themeDark')}</option>
          </select>
        </label>
      )}

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>{t('appSettings.iconSize')}</span>
        <select
          value={appSettings.toolbarIconSize ?? (hostMode === 'desktop' ? 'large' : 'small')}
          onChange={(e) =>
            onAppSettingsChange?.({
              toolbarIconSize: e.target.value as 'small' | 'large',
            })
          }
          style={inputStyle}
        >
          <option value="small">{t('appSettings.iconSizeSmall')}</option>
          <option value="large">{t('appSettings.iconSizeLarge')}</option>
        </select>
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>{t('appSettings.defaultFontSize')}</span>
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
        <span>{t('appSettings.defaultRowHeight')}</span>
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
        <span>{t('appSettings.defaultMarkerColor')}</span>
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
        <span>{t('appSettings.noHeaderColStyle')}</span>
        <select
          value={appSettings.noHeaderColumnStyle ?? 'excel'}
          onChange={(e) =>
            onAppSettingsChange?.({
              noHeaderColumnStyle: e.target.value as 'excel' | 'numbered',
            })
          }
          style={inputStyle}
        >
          <option value="excel">{t('appSettings.colStyleExcel')}</option>
          <option value="numbered">{t('appSettings.colStyleNumbered')}</option>
        </select>
      </label>

      <DialogSwitchRow
        label={t('appSettings.showRowNumbers')}
        checked={appSettings.showRowNumbers !== false}
        onCheckedChange={(checked) => onAppSettingsChange?.({ showRowNumbers: checked })}
      />

      <DialogSwitchRow
        label={t('appSettings.zebraStriping')}
        checked={appSettings.zebraStriping !== false}
        onCheckedChange={(checked) => onAppSettingsChange?.({ zebraStriping: checked })}
      />

      {hostMode === 'vscode' && (
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{t('appSettings.sidecarVisibility')}</span>
          <select
            value={appSettings.sidecarVisibility ?? 'nest'}
            onChange={(e) =>
              onAppSettingsChange?.({
                sidecarVisibility: e.target.value as 'nest' | 'hide' | 'show',
              })
            }
            style={inputStyle}
          >
            <option value="nest">{t('appSettings.sidecarNest')}</option>
            <option value="hide">{t('appSettings.sidecarHide')}</option>
            <option value="show">{t('appSettings.sidecarShow')}</option>
          </select>
        </label>
      )}

      {hostMode === 'desktop' && (
        <DialogSwitchRow
          label={t('appSettings.reopenLastFiles')}
          checked={appSettings.reopenLastFiles !== false}
          onCheckedChange={(checked) => onAppSettingsChange?.({ reopenLastFiles: checked })}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        <DialogSwitchRow
          label={t('appSettings.historyEnabled')}
          bold
          checked={appSettings.historyEnabled !== false}
          onCheckedChange={(checked) => onAppSettingsChange?.({ historyEnabled: checked })}
        />

        {appSettings.historyEnabled !== false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ opacity: 0.85 }}>{t('appSettings.historyRetentionMode')}</span>
              <select
                value={appSettings.historyRetentionMode ?? 'count'}
                onChange={(e) =>
                  onAppSettingsChange?.({
                    historyRetentionMode: e.target.value as 'count' | 'sizeMb',
                  })
                }
                style={inputStyle}
              >
                <option value="count">{t('appSettings.historyRetentionCount')}</option>
                <option value="sizeMb">{t('appSettings.historyRetentionSize')}</option>
              </select>
            </label>

            {(appSettings.historyRetentionMode ?? 'count') === 'count' ? (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ opacity: 0.85 }}>{t('appSettings.historyMaxCount')}</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={appSettings.historyMaxCount ?? 10}
                  onChange={(e) =>
                    onAppSettingsChange?.({
                      historyMaxCount: Math.max(1, Math.min(500, Number(e.target.value) || 10)),
                    })
                  }
                  style={{ ...inputStyle, width: 76 }}
                />
              </label>
            ) : (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ opacity: 0.85 }}>{t('appSettings.historyMaxTotalSizeMb')}</span>
                <input
                  type="number"
                  min={1}
                  max={2048}
                  value={appSettings.historyMaxTotalSizeMb ?? 10}
                  onChange={(e) =>
                    onAppSettingsChange?.({
                      historyMaxTotalSizeMb: Math.max(
                        1,
                        Math.min(2048, Number(e.target.value) || 10),
                      ),
                    })
                  }
                  style={{ ...inputStyle, width: 76 }}
                />
              </label>
            )}

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ opacity: 0.85 }}>{t('appSettings.historyMaxDataFileSizeMb')}</span>
              <input
                type="number"
                min={0}
                max={1024}
                value={appSettings.historyMaxDataFileSizeMb ?? 20}
                onChange={(e) =>
                  onAppSettingsChange?.({
                    historyMaxDataFileSizeMb: Math.max(
                      0,
                      Math.min(1024, Number(e.target.value) || 0),
                    ),
                  })
                }
                style={{ ...inputStyle, width: 76 }}
              />
            </label>
          </div>
        )}
      </div>

      {extraSection && (
        <div style={{ marginTop: 4 }}>{extraSection}</div>
      )}
    </div>
  );
};
