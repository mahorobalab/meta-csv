import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, ExternalLink, FileSpreadsheet } from 'lucide-react';
import {
  MetaCsvEditor,
  resolveThemeMode,
  useSystemTheme,
  type EditorAppSettings,
  type EditorStatusInfo,
  type ThemePreference,
} from '@meta-csv/ui';
import {
  APP_LOG,
  APP_LOG_META,
  EVENTS_JSONL,
  EVENTS_JSONL_META,
  LARGE_CSV_META,
  SPEC_SETTING_CSV,
  SPEC_SETTING_META,
  createFileAdapter,
  createMemoryAdapter,
  generateLargeCsvBytes,
} from './datasets';

type PresetKey = 'spec' | 'jsonl' | 'log' | 'large100k' | 'new' | 'custom';

const STORAGE_KEY = 'metacsv:playground-settings:v1';

interface PlaygroundSettings extends EditorAppSettings {
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
    return {
      theme,
      showMetaPanel,
      defaultFontSize: parsed.defaultFontSize,
      defaultRowHeight: parsed.defaultRowHeight,
      defaultMarkerColor: parsed.defaultMarkerColor,
      showRowNumbers: parsed.showRowNumbers,
      noHeaderColumnStyle: parsed.noHeaderColumnStyle,
    };
  } catch {
    return { theme: 'system', showMetaPanel: true };
  }
}

export const App: React.FC = () => {
  const initial = useMemo(() => loadPlaygroundSettings(), []);
  const [preset, setPreset] = useState<PresetKey>('spec');
  const [themePref, setThemePref] = useState<ThemePreference>(initial.theme);
  const [showMetaPanel, setShowMetaPanel] = useState<boolean>(initial.showMetaPanel);
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({
    defaultFontSize: initial.defaultFontSize,
    defaultRowHeight: initial.defaultRowHeight,
    defaultMarkerColor: initial.defaultMarkerColor,
    showRowNumbers: initial.showRowNumbers,
    noHeaderColumnStyle: initial.noHeaderColumnStyle,
  });
  const [metaText, setMetaText] = useState<string>(SPEC_SETTING_META);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [newSeq, setNewSeq] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveThemeMode(themePref, systemTheme);

  useEffect(() => {
    try {
      const payload: PlaygroundSettings = {
        theme: themePref,
        showMetaPanel,
        ...appSettings,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }, [themePref, showMetaPanel, appSettings]);

  const adapter = useMemo(() => {
    if (preset === 'spec') {
      return createMemoryAdapter({
        fileName: 'spec_setting.csv',
        csvBytes: new TextEncoder().encode(SPEC_SETTING_CSV),
        metaText: SPEC_SETTING_META,
      });
    }
    if (preset === 'jsonl') {
      return createMemoryAdapter({
        fileName: 'events.jsonl',
        csvBytes: new TextEncoder().encode(EVENTS_JSONL),
        metaText: EVENTS_JSONL_META,
      });
    }
    if (preset === 'log') {
      return createMemoryAdapter({
        fileName: 'app.log',
        csvBytes: new TextEncoder().encode(APP_LOG),
        metaText: APP_LOG_META,
      });
    }
    if (preset === 'large100k') {
      return createMemoryAdapter({
        fileName: 'benchmark_100k.csv',
        csvBytes: generateLargeCsvBytes(100_000),
        metaText: LARGE_CSV_META,
      });
    }
    if (preset === 'new') {
      return createMemoryAdapter({
        fileName: 'untitled.csv',
        csvBytes: new TextEncoder().encode([',,,,', ',,,,', ',,,,', ',,,,', ',,,,'].join('\r\n')),
        metaText: '{\n  "version": "0.1",\n  "format": "csv",\n  "csv": { "hasHeader": false }\n}\n',
      });
    }
    if (customFile) {
      return createFileAdapter(customFile, null);
    }
    return createMemoryAdapter({
      fileName: 'spec_setting.csv',
      csvBytes: new TextEncoder().encode(SPEC_SETTING_CSV),
      metaText: SPEC_SETTING_META,
    });
  }, [preset, customFile, newSeq]);

  const handleOpenLocalCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCustomFile(file);
    setMetaText('');
    setPreset('custom');
  };

  const isDark = resolvedTheme === 'dark';
  const barFg = isDark ? '#f8fafc' : '#0f172a';
  const border = isDark ? '#333338' : '#cbd5e1';

  const menuRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    padding: '6px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: barFg,
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const fileMenuItems = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ padding: '4px 8px 2px', fontSize: 10.5, opacity: 0.6, fontWeight: 600 }}>
        Sample Datasets
      </div>
      <button
        type="button"
        style={menuRowStyle}
        onClick={() => {
          setMetaText(SPEC_SETTING_META);
          setPreset('spec');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <FileSpreadsheet size={13} />
          <span>spec_setting.csv</span>
        </span>
        {preset === 'spec' && <Check size={13} />}
      </button>
      <button
        type="button"
        style={menuRowStyle}
        onClick={() => {
          setMetaText(EVENTS_JSONL_META);
          setPreset('jsonl');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Code2 size={13} />
          <span>events.jsonl (JSONL Log)</span>
        </span>
        {preset === 'jsonl' && <Check size={13} />}
      </button>
      <button
        type="button"
        style={menuRowStyle}
        onClick={() => {
          setMetaText(APP_LOG_META);
          setPreset('log');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Code2 size={13} />
          <span>app.log (App Log + StackTrace)</span>
        </span>
        {preset === 'log' && <Check size={13} />}
      </button>
      <button
        type="button"
        style={menuRowStyle}
        onClick={() => {
          setMetaText(LARGE_CSV_META);
          setPreset('large100k');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <FileSpreadsheet size={13} />
          <span>100,000 Rows Benchmark</span>
        </span>
        {preset === 'large100k' && <Check size={13} />}
      </button>
      <button
        type="button"
        style={menuRowStyle}
        onClick={() => setShowMetaPanel((s) => !s)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Code2 size={13} />
          <span>{showMetaPanel ? 'Hide .metatext.jsonc Panel' : 'Show .metatext.jsonc Panel'}</span>
        </span>
        {showMetaPanel && <Check size={13} />}
      </button>
      <a
        href="../"
        style={{
          ...menuRowStyle,
          textDecoration: 'none',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ExternalLink size={13} />
          <span>Back to MetaText Editor Home</span>
        </span>
      </a>
    </div>
  );

  const settingsExtraSection = (
    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
      }}
    >
      <span>Show live .metatext.jsonc panel</span>
      <input
        type="checkbox"
        checked={showMetaPanel}
        onChange={(e) => setShowMetaPanel(e.target.checked)}
      />
    </label>
  );

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: isDark ? '#1e1e1e' : '#ffffff',
        color: barFg,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.jsonl,.ndjson,.log,.txt"
        onChange={handleOpenLocalCsv}
        style={{ display: 'none' }}
      />

      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <MetaCsvEditor
          adapter={adapter}
          hostMode="web"
          themeMode={resolvedTheme}
          themePreference={themePref}
          systemTheme={systemTheme}
          onThemePreferenceChange={setThemePref}
          appSettings={appSettings}
          onAppSettingsChange={(patch) =>
            setAppSettings((prev) => ({ ...prev, ...patch }))
          }
          onNewFile={() => {
            setMetaText('{\n  "version": "0.1",\n  "format": "csv",\n  "csv": { "hasHeader": false }\n}\n');
            setPreset('new');
            setNewSeq((s) => s + 1);
          }}
          onOpenFile={() => fileInputRef.current?.click()}
          onSaveAs={(bytes) => {
            const name = window.prompt('Save As file name:', 'export.csv')?.trim();
            if (!name) return false;
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const blob = new Blob([copy], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
          }}
          onCloseFile={() => {
            setCustomFile(null);
            setMetaText('{\n  "version": "0.1",\n  "format": "csv",\n  "csv": { "hasHeader": false }\n}\n');
            setPreset('new');
            setNewSeq((s) => s + 1);
          }}
          fileMenuItems={fileMenuItems}
          settingsExtraSection={settingsExtraSection}
          onStatusChange={(info: EditorStatusInfo) => {
            document.title = info.fileName
              ? `${info.fileName}${info.dirty ? ' *' : ''} — MetaText Editor`
              : 'MetaText Editor Web';
          }}
          externalMetaText={metaText}
          onMetaTextChange={setMetaText}
        />
      </div>

      {showMetaPanel && (
        <aside
          style={{
            width: 360,
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
            Live .metatext.jsonc (drag columns / click header / add markers)
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
    </div>
  );
};
