import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { isMetaTextZipFileName } from '@metatext-editor/core';
import {
  I18nProvider,
  MetaTextEditor,
  createNewFileTemplate,
  isLanguagePreference,
  resolveLocale,
  resolveThemeMode,
  translate,
  useSystemTheme,
  type EditorAppSettings,
  type EditorStatusInfo,
  type MessageKey,
  type MetaTextEditorHandle,
  type NewFileFormat,
  type ThemePreference,
} from '@metatext-editor/ui';
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
import {
  buildMetaTextBundleWeb,
  createWebBundleAdapter,
  triggerZipDownload,
} from './webBundle';

type PresetKey = 'spec' | 'jsonl' | 'log' | 'large100k' | 'new' | 'custom';

const STORAGE_KEY = 'metatext:playground-settings:v1';

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
      language: isLanguagePreference(parsed.language) ? parsed.language : undefined,
      toolbarIconSize:
        parsed.toolbarIconSize === 'large' || parsed.toolbarIconSize === 'small'
          ? parsed.toolbarIconSize
          : undefined,
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
    language: initial.language,
    toolbarIconSize: initial.toolbarIconSize,
    defaultFontSize: initial.defaultFontSize,
    defaultRowHeight: initial.defaultRowHeight,
    defaultMarkerColor: initial.defaultMarkerColor,
    showRowNumbers: initial.showRowNumbers,
    noHeaderColumnStyle: initial.noHeaderColumnStyle,
  });
  const [metaText, setMetaText] = useState<string>(SPEC_SETTING_META);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customMetaText, setCustomMetaText] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<NewFileFormat>('csv');
  const [newSeq, setNewSeq] = useState<number>(0);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<MetaTextEditorHandle | null>(null);
  const currentFileNameRef = useRef<string>('spec_setting.csv');
  const isDirtyRef = useRef<boolean>(false);
  const dragDepthRef = useRef<number>(0);

  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveThemeMode(themePref, systemTheme);
  const resolvedLocale = resolveLocale(appSettings.language);
  const t = (key: MessageKey, params?: Record<string, string | number>) =>
    translate(resolvedLocale, key, params);

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
      const tpl = createNewFileTemplate(newFormat);
      return createMemoryAdapter({
        fileName: tpl.fileName,
        csvBytes: new TextEncoder().encode(tpl.content),
        metaText: tpl.metaText,
      });
    }
    if (customFile) {
      if (isMetaTextZipFileName(customFile.name)) {
        return createWebBundleAdapter(customFile, (loadedMeta) => {
          setMetaText(loadedMeta);
        });
      }
      return createFileAdapter(customFile, customMetaText);
    }
    return createMemoryAdapter({
      fileName: 'spec_setting.csv',
      csvBytes: new TextEncoder().encode(SPEC_SETTING_CSV),
      metaText: SPEC_SETTING_META,
    });
  }, [preset, customFile, customMetaText, newFormat, newSeq]);

  const openDroppedFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const sidecarFile = files.find((f) => f.name.toLowerCase().endsWith('.metatext.jsonc')) ?? null;
    const dataFile = files.find((f) => !f.name.toLowerCase().endsWith('.metatext.jsonc'));
    if (!dataFile) return;

    if (dataFile.name.toLowerCase().endsWith('.zip') && !isMetaTextZipFileName(dataFile.name)) {
      window.alert(
        'Only ".metatext.zip" bundles are supported (regular .zip files cannot be opened).',
      );
      return;
    }

    if (
      isDirtyRef.current &&
      !window.confirm(t('web.discardConfirm', { name: dataFile.name }))
    ) {
      return;
    }

    let nextMeta: string | null = null;
    if (sidecarFile && !isMetaTextZipFileName(dataFile.name)) {
      try {
        nextMeta = await sidecarFile.text();
      } catch {
        nextMeta = null;
      }
    }
    setCustomFile(dataFile);
    setCustomMetaText(nextMeta);
    setMetaText(nextMeta ?? '');
    setPreset('custom');
    setNewSeq((s) => s + 1);
  };

  const handleOpenLocalCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.zip') && !isMetaTextZipFileName(file.name)) {
      window.alert(
        'Only ".metatext.zip" bundles are supported (regular .zip files cannot be opened).',
      );
      return;
    }
    if (
      isDirtyRef.current &&
      !window.confirm(t('web.discardConfirm', { name: file.name }))
    ) {
      return;
    }
    setCustomFile(file);
    setCustomMetaText(null);
    setMetaText('');
    setPreset('custom');
    setNewSeq((s) => s + 1);
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
        {t('web.sampleDatasets')}
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
          <span>{t('web.benchmark100k')}</span>
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
          <span>{showMetaPanel ? t('desktop.hideMetaPanel') : t('desktop.showMetaPanel')}</span>
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
          <span>{t('web.backToHome')}</span>
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
      <span>{t('desktop.showLiveMetaPanel')}</span>
      <input
        type="checkbox"
        checked={showMetaPanel}
        onChange={(e) => setShowMetaPanel(e.target.checked)}
      />
    </label>
  );

  return (
    <I18nProvider preference={appSettings.language}>
    <div
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingFile(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingFile(false);
        void openDroppedFiles(e.dataTransfer.files);
      }}
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: isDark ? '#1e1e1e' : '#ffffff',
        color: barFg,
        position: 'relative',
      }}
    >
      {isDraggingFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(239, 246, 255, 0.82)',
            border: '3px dashed #3b82f6',
          }}
        >
          <div
            style={{
              padding: '16px 28px',
              borderRadius: 10,
              background: isDark ? '#1e293b' : '#ffffff',
              color: barFg,
              fontSize: 15,
              fontWeight: 600,
              boxShadow: '0 8px 30px rgba(0,0,0,0.22)',
              border: `1px solid ${border}`,
            }}
          >
            {t('web.dropOverlay')}
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.jsonl,.ndjson,.log,.txt,.zip"
        onChange={handleOpenLocalCsv}
        style={{ display: 'none' }}
      />

      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <MetaTextEditor
          ref={editorRef}
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
          onNewFile={(format: NewFileFormat = 'csv') => {
            const tpl = createNewFileTemplate(format);
            setNewFormat(format);
            setMetaText(tpl.metaText);
            setPreset('new');
            setNewSeq((s) => s + 1);
          }}
          onOpenFile={() => fileInputRef.current?.click()}
          onSaveAs={async (bytes) => {
            const suggestedName =
              document.title.split(' — ')[0]?.replace(/ \*$/, '').trim() || 'export.csv';
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);

            type SavePickerFn = (options?: {
              suggestedName?: string;
              types?: Array<{ description?: string; accept: Record<string, string[]> }>;
            }) => Promise<{
              createWritable: () => Promise<{
                write: (data: Blob | Uint8Array) => Promise<void>;
                close: () => Promise<void>;
              }>;
            }>;

            const picker = (window as unknown as { showSaveFilePicker?: SavePickerFn })
              .showSaveFilePicker;
            if (typeof picker === 'function') {
              try {
                const handle = await picker({
                  suggestedName,
                  types: [
                    {
                      description: 'CSV / TSV / JSONL / Log',
                      accept: {
                        'text/csv': ['.csv'],
                        'text/tab-separated-values': ['.tsv'],
                        'application/x-ndjson': ['.jsonl', '.ndjson'],
                        'text/plain': ['.log', '.txt'],
                      },
                    },
                  ],
                });
                const writable = await handle.createWritable();
                await writable.write(new Blob([copy], { type: 'text/plain;charset=utf-8' }));
                await writable.close();
                return true;
              } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') {
                  return false;
                }
                // Fall back to anchor download if picker fails unexpectedly
              }
            }

            const name = window.prompt(t('web.saveAsPrompt'), suggestedName)?.trim();
            if (!name) return false;
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
            isDirtyRef.current = info.dirty;
            if (info.fileName) {
              currentFileNameRef.current = info.fileName;
            }
            document.title = info.fileName
              ? `${info.fileName}${info.dirty ? ' *' : ''} — MetaText Editor`
              : 'MetaText Editor Web';
          }}
          onExportBundle={async () => {
            const currentBytes =
              editorRef.current?.serializeCurrentCsv() ?? (await adapter.load()).csvBytes;
            const { bundleFileName, zipBytes } = buildMetaTextBundleWeb({
              fileName: currentFileNameRef.current || 'untitled.csv',
              dataBytes: currentBytes,
              metaText,
              includeHistory: false,
            });
            triggerZipDownload(bundleFileName, zipBytes);
            return bundleFileName;
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
            {t('web.liveMetaHeader')}
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
    </I18nProvider>
  );
};
