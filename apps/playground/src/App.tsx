import React, { useEffect, useMemo, useState } from 'react';
import {
  MetaCsvEditor,
  resolveThemeMode,
  useSystemTheme,
  type ThemePreference,
} from '@meta-csv/ui';
import {
  LARGE_CSV_META,
  SPEC_SETTING_CSV,
  SPEC_SETTING_META,
  createMemoryAdapter,
  generateLargeCsvBytes,
} from './datasets';

type PresetKey = 'spec' | 'large100k' | 'custom';

const STORAGE_KEY = 'metacsv:playground-settings:v1';

interface PlaygroundSettings {
  theme: ThemePreference;
  showMetaPanel: boolean;
}

function loadPlaygroundSettings(): PlaygroundSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: 'system', showMetaPanel: true };
    const parsed = JSON.parse(raw) as Partial<PlaygroundSettings>;
    const theme: ThemePreference =
      parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
        ? parsed.theme
        : 'system';
    const showMetaPanel =
      typeof parsed.showMetaPanel === 'boolean' ? parsed.showMetaPanel : true;
    return { theme, showMetaPanel };
  } catch {
    return { theme: 'system', showMetaPanel: true };
  }
}

export const App: React.FC = () => {
  const initial = useMemo(() => loadPlaygroundSettings(), []);
  const [preset, setPreset] = useState<PresetKey>('spec');
  const [themePref, setThemePref] = useState<ThemePreference>(initial.theme);
  const [showMetaPanel, setShowMetaPanel] = useState<boolean>(initial.showMetaPanel);
  const [metaText, setMetaText] = useState<string>(SPEC_SETTING_META);
  const [customFile, setCustomFile] = useState<{
    fileName: string;
    csvBytes: Uint8Array;
    metaText: string | null;
  } | null>(null);

  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveThemeMode(themePref, systemTheme);

  useEffect(() => {
    try {
      const payload: PlaygroundSettings = { theme: themePref, showMetaPanel };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }, [themePref, showMetaPanel]);

  const adapter = useMemo(() => {
    if (preset === 'spec') {
      return createMemoryAdapter({
        fileName: 'spec_setting.csv',
        csvBytes: new TextEncoder().encode(SPEC_SETTING_CSV),
        metaText: SPEC_SETTING_META,
      });
    }
    if (preset === 'large100k') {
      return createMemoryAdapter({
        fileName: 'benchmark_100k.csv',
        csvBytes: generateLargeCsvBytes(100_000),
        metaText: LARGE_CSV_META,
      });
    }
    if (customFile) {
      return createMemoryAdapter(customFile);
    }
    return createMemoryAdapter({
      fileName: 'spec_setting.csv',
      csvBytes: new TextEncoder().encode(SPEC_SETTING_CSV),
      metaText: SPEC_SETTING_META,
    });
  }, [preset, customFile]);

  const handleOpenLocalCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setCustomFile({
      fileName: file.name,
      csvBytes: new Uint8Array(buf),
      metaText: null,
    });
    setPreset('custom');
  };

  const isDark = resolvedTheme === 'dark';
  const barBg = isDark ? '#18181b' : '#e2e8f0';
  const barFg = isDark ? '#f8fafc' : '#0f172a';
  const border = isDark ? '#333338' : '#cbd5e1';

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${active ? '#3b82f6' : border}`,
    background: active ? '#2563eb' : isDark ? '#27272a' : '#ffffff',
    color: active ? '#ffffff' : barFg,
    cursor: 'pointer',
  });

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
      {/* Top Playground Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: barBg,
          borderBottom: `1px solid ${border}`,
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 700, marginRight: 6 }}>MetaCSV Playground</span>

        <button style={tabBtn(preset === 'spec')} onClick={() => setPreset('spec')}>
          spec_setting.csv
        </button>
        <button style={tabBtn(preset === 'large100k')} onClick={() => setPreset('large100k')}>
          100,000 Rows Benchmark
        </button>
        <label style={{ ...tabBtn(preset === 'custom'), display: 'inline-block' }}>
          Open Local CSV...
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => void handleOpenLocalCsv(e)}
            style={{ display: 'none' }}
          />
        </label>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <span style={{ opacity: 0.8 }}>Theme:</span>
            <select
              aria-label="Theme mode"
              value={themePref}
              onChange={(e) => setThemePref(e.target.value as ThemePreference)}
              style={{
                ...tabBtn(false),
                padding: '3px 8px',
              }}
            >
              <option value="system">System ({systemTheme})</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button
            style={tabBtn(showMetaPanel)}
            onClick={() => setShowMetaPanel((s) => !s)}
          >
            {showMetaPanel ? 'Hide .meta.jsonc' : 'Show .meta.jsonc'}
          </button>
        </div>
      </header>

      {/* Main Split View */}
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          <MetaCsvEditor
            adapter={adapter}
            themeMode={resolvedTheme}
            externalMetaText={metaText}
            onMetaTextChange={setMetaText}
          />
        </div>

        {showMetaPanel && (
          <aside
            style={{
              width: 380,
              borderLeft: `1px solid ${border}`,
              display: 'flex',
              flexDirection: 'column',
              background: isDark ? '#1a1a1d' : '#f8fafc',
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderBottom: `1px solid ${border}`,
              }}
            >
              Live .meta.jsonc (drag columns / click header to watch updates)
            </div>
            <textarea
              value={metaText}
              onChange={(e) => setMetaText(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: 10,
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontSize: 12,
                lineHeight: 1.5,
                background: isDark ? '#141416' : '#ffffff',
                color: isDark ? '#d4d4d8' : '#1e293b',
              }}
            />
          </aside>
        )}
      </main>
    </div>
  );
};
