import React from 'react';
import { MARKER_COLORS, MARKER_PALETTE } from '../MarkerControls';
import type { ThemePreference } from '../theme';
import type { EditorAppSettings, EditorHostMode } from './types';

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
}) => (
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

    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
      }}
    >
      <span>Show Row Numbers</span>
      <input
        type="checkbox"
        checked={appSettings.showRowNumbers !== false}
        onChange={(e) => onAppSettingsChange?.({ showRowNumbers: e.target.checked })}
      />
    </label>

    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
      }}
    >
      <span>Alternating Row Colors (Zebra)</span>
      <input
        type="checkbox"
        checked={appSettings.zebraStriping !== false}
        onChange={(e) => onAppSettingsChange?.({ zebraStriping: e.target.checked })}
      />
    </label>

    {hostMode === 'vscode' && (
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>.metatext.jsonc in Explorer</span>
        <select
          value={appSettings.sidecarVisibility ?? 'nest'}
          onChange={(e) =>
            onAppSettingsChange?.({
              sidecarVisibility: e.target.value as 'nest' | 'hide' | 'show',
            })
          }
          style={inputStyle}
        >
          <option value="nest">Nest under parent (Default)</option>
          <option value="hide">Hide completely</option>
          <option value="show">Show normally</option>
        </select>
      </label>
    )}

    {hostMode === 'desktop' && (
      <label
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <span>Reopen Last Files on Startup</span>
        <input
          type="checkbox"
          checked={appSettings.reopenLastFiles !== false}
          onChange={(e) => onAppSettingsChange?.({ reopenLastFiles: e.target.checked })}
        />
      </label>
    )}

    {extraSection && (
      <>
        <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '2px 0' }} />
        {extraSection}
      </>
    )}
  </div>
);
