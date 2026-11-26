import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Info, Settings } from 'lucide-react';
import {
  AboutModal,
  MetaCsvEditor,
  SettingsModal,
  resolveThemeMode,
  useSystemTheme,
  type EditorAppSettings,
  type EditorStatusInfo,
  type ThemePreference,
} from '@meta-csv/ui';
import { createTauriAdapter } from './tauriAdapter';

interface DesktopAppSettings extends EditorAppSettings {
  theme: ThemePreference;
  lastDirectory?: string | null;
}

function getParentDirectory(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

export const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [themePref, setThemePref] = useState<ThemePreference>('system');
  const [lastDirectory, setLastDirectory] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({});
  const [showEmptySettings, setShowEmptySettings] = useState(false);
  const [showEmptyAbout, setShowEmptyAbout] = useState(false);
  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveThemeMode(themePref, systemTheme);

  useEffect(() => {
    invoke<DesktopAppSettings>('get_app_settings')
      .then((settings) => {
        if (
          settings.theme === 'system' ||
          settings.theme === 'light' ||
          settings.theme === 'dark'
        ) {
          setThemePref(settings.theme);
        }
        if (settings.lastDirectory) {
          setLastDirectory(settings.lastDirectory);
        }
        setAppSettings({
          defaultFontSize: settings.defaultFontSize,
          defaultRowHeight: settings.defaultRowHeight,
          defaultMarkerColor: settings.defaultMarkerColor,
          showRowNumbers: settings.showRowNumbers,
          noHeaderColumnStyle: settings.noHeaderColumnStyle,
        });
      })
      .catch(() => {
        // Ignore when running outside Tauri
      });

    invoke<string | null>('get_initial_file')
      .then((initial) => {
        if (initial) setFilePath(initial);
      })
      .catch(() => {
        // Ignore when running outside Tauri
      });
  }, []);

  const handleThemeChange = (next: ThemePreference) => {
    setThemePref(next);
    invoke('update_app_settings', { theme: next }).catch(() => {
      // Ignore when running outside Tauri
    });
  };

  const handleAppSettingsChange = (patch: Partial<EditorAppSettings>) => {
    setAppSettings((prev) => ({ ...prev, ...patch }));
    invoke('update_app_settings', patch).catch(() => {
      // Ignore when running outside Tauri
    });
  };

  const adapter = useMemo(
    () => (filePath ? createTauriAdapter(filePath) : null),
    [filePath],
  );

  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      defaultPath: lastDirectory,
      filters: [
        { name: 'CSV / TSV / JSONL', extensions: ['csv', 'tsv', 'jsonl', 'ndjson', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (typeof selected === 'string') {
      setFilePath(selected);
      const dir = getParentDirectory(selected);
      if (dir) {
        setLastDirectory(dir);
        invoke('update_app_settings', { lastDirectory: dir }).catch(() => {
          // Ignore when running outside Tauri
        });
      }
    }
  };

  const isDark = resolvedTheme === 'dark';
  const barFg = isDark ? '#f8fafc' : '#0f172a';
  const border = isDark ? '#333338' : '#cbd5e1';

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${border}`,
    background: isDark ? '#27272a' : '#ffffff',
    color: barFg,
    cursor: 'pointer',
  };

  if (adapter) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: isDark ? '#1e1e1e' : '#ffffff',
          color: barFg,
        }}
      >
        <MetaCsvEditor
          adapter={adapter}
          hostMode="desktop"
          themeMode={resolvedTheme}
          themePreference={themePref}
          systemTheme={systemTheme}
          onThemePreferenceChange={handleThemeChange}
          appSettings={appSettings}
          onAppSettingsChange={handleAppSettingsChange}
          onOpenFile={() => void handleOpenFile()}
          onStatusChange={(info: EditorStatusInfo) => {
            const title = info.fileName
              ? `MetaCSV - ${info.fileName}${info.dirty ? ' *' : ''}`
              : 'MetaCSV';
            invoke('set_window_title', { title }).catch(() => {
              // Ignore when running outside Tauri
            });
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: isDark ? '#1e1e1e' : '#ffffff',
        color: barFg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 6,
          padding: '8px 12px',
        }}
      >
        <button
          type="button"
          style={{ ...btnStyle, padding: '5px 8px' }}
          title="Settings"
          onClick={() => setShowEmptySettings(true)}
        >
          <Settings size={14} />
        </button>
        <button
          type="button"
          style={{ ...btnStyle, padding: '5px 8px' }}
          title="About MetaCSV"
          onClick={() => setShowEmptyAbout(true)}
        >
          <Info size={14} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          opacity: 0.9,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>MetaCSV Desktop</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          CSV / TSV / JSONL を開くと、隣の .metatext.jsonc を自動で読み書きします
        </div>
        <button
          type="button"
          style={{
            ...btnStyle,
            padding: '8px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: '#2563eb',
            borderColor: '#3b82f6',
            color: '#ffffff',
          }}
          onClick={() => void handleOpenFile()}
        >
          CSV / JSONL ファイルを開く
        </button>
      </div>

      <SettingsModal
        open={showEmptySettings}
        onClose={() => setShowEmptySettings(false)}
        themeMode={resolvedTheme}
        themePreference={themePref}
        systemTheme={systemTheme}
        onThemePreferenceChange={handleThemeChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
      <AboutModal
        open={showEmptyAbout}
        onClose={() => setShowEmptyAbout(false)}
        themeMode={resolvedTheme}
        hostMode="desktop"
      />
    </div>
  );
};
