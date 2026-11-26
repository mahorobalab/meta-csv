import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Check, Code2, Copy, FileSpreadsheet, Info, Moon, Plus, Settings, X } from 'lucide-react';
import type { FileSystemAdapter } from '@meta-csv/core';
import {
  AboutModal,
  MetaCsvEditor,
  SettingsModal,
  resolveThemeMode,
  useSystemTheme,
  type EditorAppSettings,
  type EditorStatusInfo,
  type EditorViewSnapshot,
  type MetaCsvEditorHandle,
  type NativeClipboardBridge,
  type ThemePreference,
} from '@meta-csv/ui';
import { createTauriAdapter, createUntitledDesktopAdapter } from './tauriAdapter';

interface DesktopAppSettings extends EditorAppSettings {
  theme: ThemePreference;
  lastDirectory?: string | null;
  lastOpenedFiles?: string[] | null;
  lastActiveFile?: string | null;
}

interface DesktopTab {
  id: string;
  filePath: string | null;
  fileName: string;
  dirty: boolean;
  adapter: FileSystemAdapter;
  sleeping: boolean;
  lastAccessedAt: number;
  fileBytes: number;
  metaText?: string;
  viewSnapshot?: EditorViewSnapshot;
}

/**
 * Automatic memory budget for Desktop multi-tab mode:
 * Inactive, unmodified tabs backed by a file on disk are automatically put to sleep
 * (unmounted to free JS heap memory, keeping only a tiny view snapshot) when either
 * total mounted raw file bytes or total mounted tab count exceeds these limits.
 */
const MAX_AWAKE_TAB_BYTES = 40 * 1024 * 1024; // 40 MB raw file budget across mounted tabs
const MAX_AWAKE_TABS = 5;

function formatBytesShort(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getParentDirectory(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

function extractFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || 'untitled.csv';
}

function normalizePathKey(p: string): string {
  return p.replace(/\//g, '\\').toLowerCase();
}

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<DesktopTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [themePref, setThemePref] = useState<ThemePreference>('system');
  const [lastDirectory, setLastDirectory] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({});
  const [showEmptySettings, setShowEmptySettings] = useState(false);
  const [showEmptyAbout, setShowEmptyAbout] = useState(false);
  const [showMetaPanel, setShowMetaPanel] = useState(false);
  const [metaCopied, setMetaCopied] = useState(false);
  const metaPanelSaveTimerRef = useRef<number | null>(null);
  const sessionReadyRef = useRef(false);
  const lastPersistedSessionKeyRef = useRef<string>('');
  const nextTabIdRef = useRef(1);
  const lastDirRef = useRef<string | undefined>(undefined);
  const tabsRef = useRef<DesktopTab[]>([]);
  const editorRefs = useRef<Map<string, MetaCsvEditorHandle>>(new Map());
  tabsRef.current = tabs;
  lastDirRef.current = lastDirectory;

  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveThemeMode(themePref, systemTheme);

  const nativeClipboard = useMemo<NativeClipboardBridge>(
    () => ({
      readText: () => invoke<string>('read_clipboard_text'),
      writeText: (text: string) => invoke<void>('write_clipboard_text', { text }),
      writeHtml: (html: string, altText: string) =>
        invoke<void>('write_clipboard_html', { html, altText }),
    }),
    [],
  );

  const applyMemoryBudget = useCallback(
    (list: DesktopTab[], nextActiveId: string | null): DesktopTab[] => {
      const now = Date.now();
      const updated = list.map((t) =>
        t.id === nextActiveId ? { ...t, sleeping: false, lastAccessedAt: now } : t,
      );

      let awakeCount = 0;
      let awakeBytes = 0;
      for (const t of updated) {
        if (!t.sleeping) {
          awakeCount++;
          awakeBytes += t.fileBytes;
        }
      }

      if (awakeCount <= MAX_AWAKE_TABS && awakeBytes <= MAX_AWAKE_TAB_BYTES) {
        return updated;
      }

      // Candidates for sleeping: mounted, inactive, unmodified, and backed by a file on disk (LRU order)
      const candidates = updated
        .filter((t) => !t.sleeping && t.id !== nextActiveId && !t.dirty && t.filePath !== null)
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

      if (candidates.length === 0) return updated;

      const sleepIds = new Set<string>();
      for (const c of candidates) {
        if (awakeCount <= MAX_AWAKE_TABS && awakeBytes <= MAX_AWAKE_TAB_BYTES) break;
        sleepIds.add(c.id);
        awakeCount--;
        awakeBytes = Math.max(0, awakeBytes - c.fileBytes);
      }

      if (sleepIds.size === 0) return updated;

      return updated.map((t) => {
        if (!sleepIds.has(t.id)) return t;
        const snapshot = editorRefs.current.get(t.id)?.captureViewSnapshot() ?? t.viewSnapshot;
        return {
          ...t,
          sleeping: true,
          viewSnapshot: snapshot,
        };
      });
    },
    [],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const prevActiveId = activeTabId;
      const prevSnapshot =
        prevActiveId && prevActiveId !== tabId
          ? editorRefs.current.get(prevActiveId)?.captureViewSnapshot()
          : undefined;
      setActiveTabId(tabId);
      setTabs((prev) => {
        const withPrevSnapshot = prevSnapshot
          ? prev.map((t) =>
              t.id === prevActiveId ? { ...t, viewSnapshot: prevSnapshot } : t,
            )
          : prev;
        return applyMemoryBudget(withPrevSnapshot, tabId);
      });
    },
    [activeTabId, applyMemoryBudget],
  );

  const updateLastDirectory = useCallback((filePath: string) => {
    const dir = getParentDirectory(filePath);
    if (!dir) return;
    setLastDirectory(dir);
    invoke('update_app_settings', { lastDirectory: dir }).catch(() => {
      // Ignore when running outside Tauri
    });
  }, []);

  const saveTabAs = useCallback(
    async (tabId: string, bytes: Uint8Array, metaText: string): Promise<boolean> => {
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      const defaultPath =
        currentTab?.filePath ??
        (lastDirRef.current ? `${lastDirRef.current}\\untitled.csv` : 'untitled.csv');
      const selected = await save({
        defaultPath,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'TSV', extensions: ['tsv'] },
          { name: 'JSONL', extensions: ['jsonl', 'ndjson'] },
          { name: 'Log / Text', extensions: ['log', 'txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (typeof selected !== 'string' || selected.length === 0) {
        return false;
      }
      await invoke('save_csv_raw', bytes, {
        headers: {
          'x-file-path': encodeURIComponent(selected),
        },
      });
      if (metaText.trim().length > 0) {
        await invoke('save_meta_text', {
          path: selected,
          metaText,
        });
      }

      const normDest = normalizePathKey(selected);
      const nextAdapter = createTauriAdapter(selected);
      const nextName = extractFileName(selected);

      setTabs((prev) => {
        const next = prev
          .filter((t) => t.id === tabId || !t.filePath || normalizePathKey(t.filePath) !== normDest)
          .map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  filePath: selected,
                  fileName: nextName,
                  dirty: false,
                  sleeping: false,
                  fileBytes: bytes.byteLength,
                  adapter: nextAdapter,
                }
              : t,
          );
        return applyMemoryBudget(next, tabId);
      });
      setActiveTabId(tabId);
      updateLastDirectory(selected);
      return true;
    },
    [updateLastDirectory, applyMemoryBudget],
  );

  const openFilePathsInTabs = useCallback(
    (paths: string[], preferredActivePath?: string | null) => {
      if (paths.length === 0) return;
      let targetActiveId: string | null = null;
      const existing = tabsRef.current;
      const toAdd: DesktopTab[] = [];
      const now = Date.now();
      const normPreferred = preferredActivePath ? normalizePathKey(preferredActivePath) : null;

      // Determine which path in `paths` should be active & initially awake
      let activeIndex = paths.length - 1;
      if (normPreferred) {
        const idx = paths.findIndex((p) => normalizePathKey(p) === normPreferred);
        if (idx !== -1) activeIndex = idx;
      }

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i]!;
        const norm = normalizePathKey(p);
        const found = existing.find((t) => t.filePath && normalizePathKey(t.filePath) === norm);
        if (found) {
          if (i === activeIndex || targetActiveId === null) {
            targetActiveId = found.id;
          }
        } else {
          const alreadyAdded = toAdd.find(
            (t) => t.filePath && normalizePathKey(t.filePath) === norm,
          );
          if (alreadyAdded) {
            if (i === activeIndex || targetActiveId === null) {
              targetActiveId = alreadyAdded.id;
            }
          } else {
            const id = `tab-${nextTabIdRef.current++}`;
            const isTargetActive = i === activeIndex;
            toAdd.push({
              id,
              filePath: p,
              fileName: extractFileName(p),
              dirty: false,
              adapter: createTauriAdapter(p),
              sleeping: !isTargetActive,
              lastAccessedAt: isTargetActive ? now + paths.length : now + i,
              fileBytes: 0,
            });
            if (isTargetActive || targetActiveId === null) {
              targetActiveId = id;
            }
          }
        }
      }

      if (toAdd.length > 0 || targetActiveId) {
        setTabs((prev) => applyMemoryBudget([...prev, ...toAdd], targetActiveId));
      }
      if (targetActiveId) {
        setActiveTabId(targetActiveId);
      }
      updateLastDirectory(paths[activeIndex] ?? paths[paths.length - 1]!);
    },
    [updateLastDirectory, applyMemoryBudget],
  );

  const handleNewTab = useCallback(() => {
    const id = `tab-${nextTabIdRef.current++}`;
    const adapter = createUntitledDesktopAdapter((bytes, metaText) =>
      saveTabAs(id, bytes, metaText),
    );
    const tab: DesktopTab = {
      id,
      filePath: null,
      fileName: 'untitled.csv',
      dirty: false,
      adapter,
      sleeping: false,
      lastAccessedAt: Date.now(),
      fileBytes: 0,
    };
    setTabs((prev) => applyMemoryBudget([...prev, tab], id));
    setActiveTabId(id);
  }, [saveTabAs, applyMemoryBudget]);

  const closeTab = useCallback((tabId: string, skipConfirm = false) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target) return;
    if (
      !skipConfirm &&
      target.dirty &&
      !window.confirm(`Discard unsaved changes and close "${target.fileName}"?`)
    ) {
      return;
    }

    editorRefs.current.delete(tabId);
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      let nextActive = activeTabId;
      if (activeTabId === tabId) {
        nextActive = next.length === 0 ? null : next[Math.min(idx, next.length - 1)]!.id;
        setActiveTabId(nextActive);
      }
      return applyMemoryBudget(next, nextActive);
    });
  }, [activeTabId, applyMemoryBudget]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<DesktopAppSettings>('get_app_settings').catch(() => null),
      invoke<string | null>('get_initial_file').catch(() => null),
    ]).then(([settings, initial]) => {
      if (cancelled) return;
      if (settings) {
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
          zebraStriping: settings.zebraStriping,
          confirmHideColumn: settings.confirmHideColumn,
          reopenLastFiles: settings.reopenLastFiles,
        });
      }

      if (initial) {
        openFilePathsInTabs([initial]);
      } else if (
        settings &&
        settings.reopenLastFiles !== false &&
        Array.isArray(settings.lastOpenedFiles) &&
        settings.lastOpenedFiles.length > 0
      ) {
        openFilePathsInTabs(settings.lastOpenedFiles, settings.lastActiveFile);
      }
      sessionReadyRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [openFilePathsInTabs]);

  // Update native window title whenever active tab or its dirty state changes
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  useEffect(() => {
    const title = activeTab
      ? `MetaText Editor - ${activeTab.fileName}${activeTab.dirty ? ' *' : ''}`
      : 'MetaText Editor';
    invoke('set_window_title', { title }).catch(() => {
      // Ignore when running outside Tauri
    });
  }, [activeTab?.id, activeTab?.fileName, activeTab?.dirty]);

  // Persist open file list & active file for startup restore (Desktop-only)
  useEffect(() => {
    if (!sessionReadyRef.current) return;
    const openedPaths = tabs
      .map((t) => t.filePath)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
    const activePath = activeTab?.filePath ?? '';
    const key = `${activePath}||${openedPaths.join('|')}`;
    if (key === lastPersistedSessionKeyRef.current) return;
    lastPersistedSessionKeyRef.current = key;
    invoke('update_app_settings', {
      lastOpenedFiles: openedPaths,
      lastActiveFile: activePath,
    }).catch(() => {
      // Ignore when running outside Tauri
    });
  }, [tabs, activeTab?.filePath]);

  // Ctrl+Tab / Ctrl+Shift+Tab tab switching
  useEffect(() => {
    if (tabs.length <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx === -1) return;
        const nextIdx = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        activateTab(tabs[nextIdx]!.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tabs, activeTabId, activateTab]);

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

  const handleOpenFile = async () => {
    const selected = await open({
      multiple: true,
      defaultPath: lastDirectory,
      filters: [
        { name: 'CSV / TSV / JSONL / Log', extensions: ['csv', 'tsv', 'jsonl', 'ndjson', 'log', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (typeof selected === 'string') {
      openFilePathsInTabs([selected]);
    } else if (Array.isArray(selected) && selected.length > 0) {
      openFilePathsInTabs(selected.filter((p): p is string => typeof p === 'string'));
    }
  };

  const handleMetaPanelEdit = useCallback((tab: DesktopTab, nextText: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, metaText: nextText } : t)),
    );
    if (metaPanelSaveTimerRef.current !== null) {
      window.clearTimeout(metaPanelSaveTimerRef.current);
    }
    metaPanelSaveTimerRef.current = window.setTimeout(() => {
      metaPanelSaveTimerRef.current = null;
      tab.adapter.saveMeta(nextText).catch((err) => {
        console.error('[MetaText Desktop] Failed to save sidecar .metatext.jsonc:', err);
      });
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (metaPanelSaveTimerRef.current !== null) {
        window.clearTimeout(metaPanelSaveTimerRef.current);
      }
    };
  }, []);

  const isDark = resolvedTheme === 'dark';
  const barFg = isDark ? '#f8fafc' : '#0f172a';
  const border = isDark ? '#333338' : '#cbd5e1';
  const tabBarBg = isDark ? '#18181b' : '#e2e8f0';
  const tabActiveBg = isDark ? '#252526' : '#f8fafc';
  const tabInactiveBg = isDark ? '#1f1f23' : '#edf2f7';

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

  if (tabs.length > 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: isDark ? '#1e1e1e' : '#ffffff',
          color: barFg,
        }}
      >
        {/* Desktop-only Multi-Tab Bar */}
        <div
          role="tablist"
          aria-label="Open Files"
          style={{
            display: 'flex',
            alignItems: 'stretch',
            height: 32,
            background: tabBarBg,
            borderBottom: `1px solid ${border}`,
            overflowX: 'auto',
            overflowY: 'hidden',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {tabs.map((tab) => {
            const isTabActive = tab.id === activeTabId;
            const sizeLabel = formatBytesShort(tab.fileBytes);
            const tabTooltip = [
              tab.filePath ?? tab.fileName,
              sizeLabel ? `(${sizeLabel})` : '',
              tab.sleeping ? '— Sleeping (memory freed; click to reload)' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isTabActive}
                title={tabTooltip}
                onClick={() => activateTab(tab.id)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 8px 0 11px',
                  maxWidth: 220,
                  minWidth: 100,
                  fontSize: 12,
                  fontWeight: isTabActive ? 600 : 400,
                  background: isTabActive ? tabActiveBg : tabInactiveBg,
                  color: barFg,
                  opacity: isTabActive ? 1 : tab.sleeping ? 0.56 : 0.78,
                  borderRight: `1px solid ${border}`,
                  borderTop: isTabActive ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {tab.sleeping ? (
                  <Moon size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
                ) : (
                  <FileSpreadsheet size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
                )}
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    fontStyle: tab.sleeping ? 'italic' : 'normal',
                  }}
                >
                  {tab.fileName}
                </span>
                {tab.dirty && (
                  <span
                    title="Unsaved changes"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#f59e0b',
                      flexShrink: 0,
                    }}
                  />
                )}
                <button
                  type="button"
                  aria-label={`Close ${tab.fileName}`}
                  title="Close tab (Ctrl+W)"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    padding: 0,
                    border: 'none',
                    borderRadius: 4,
                    background: 'transparent',
                    color: barFg,
                    opacity: isTabActive ? 0.75 : 0.45,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            aria-label="New File Tab"
            title="New File (Ctrl+N)"
            onClick={handleNewTab}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: barFg,
              opacity: 0.75,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Main content: awake editors + optional live .metatext.jsonc side panel */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
            {tabs.map((tab) => {
              if (tab.sleeping) return null;
              const isTabActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  style={{
                    display: isTabActive ? 'block' : 'none',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  <MetaCsvEditor
                    ref={(handle) => {
                      if (handle) {
                        editorRefs.current.set(tab.id, handle);
                      } else {
                        editorRefs.current.delete(tab.id);
                      }
                    }}
                    adapter={tab.adapter}
                    hostMode="desktop"
                    isActive={isTabActive}
                    initialViewSnapshot={tab.viewSnapshot}
                    filePath={tab.filePath ?? undefined}
                    themeMode={resolvedTheme}
                    themePreference={themePref}
                    systemTheme={systemTheme}
                    onThemePreferenceChange={handleThemeChange}
                    appSettings={appSettings}
                    onAppSettingsChange={handleAppSettingsChange}
                    onNewFile={handleNewTab}
                    onOpenFile={() => void handleOpenFile()}
                    onSaveAs={(bytes, metaText) => saveTabAs(tab.id, bytes, metaText)}
                    onCloseFile={() => closeTab(tab.id, true)}
                    fileMenuItems={fileMenuItems}
                    settingsExtraSection={settingsExtraSection}
                    nativeClipboard={nativeClipboard}
                    externalMetaText={tab.metaText}
                    onMetaTextChange={(nextMeta) => {
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === tab.id && t.metaText !== nextMeta
                            ? { ...t, metaText: nextMeta }
                            : t,
                        ),
                      );
                    }}
                    onStatusChange={(info: EditorStatusInfo) => {
                      const nextBytes = info.fileBytes ?? 0;
                      setTabs((prev) => {
                        const cur = prev.find((t) => t.id === tab.id);
                        if (!cur) return prev;
                        const changed =
                          cur.dirty !== info.dirty ||
                          (info.fileName && cur.fileName !== info.fileName) ||
                          (nextBytes > 0 && cur.fileBytes !== nextBytes);
                        if (!changed) return prev;
                        const updated = prev.map((t) =>
                          t.id === tab.id
                            ? {
                                ...t,
                                dirty: info.dirty,
                                fileName: info.fileName || t.fileName,
                                fileBytes: nextBytes > 0 ? nextBytes : t.fileBytes,
                              }
                            : t,
                        );
                        return nextBytes > 0 && cur.fileBytes !== nextBytes
                          ? applyMemoryBudget(updated, activeTabId)
                          : updated;
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>

          {showMetaPanel && activeTab && (
            <aside
              style={{
                width: 340,
                display: 'flex',
                flexDirection: 'column',
                borderLeft: `1px solid ${border}`,
                background: isDark ? '#18181b' : '#f8fafc',
                color: barFg,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderBottom: `1px solid ${border}`,
                  background: isDark ? '#252526' : '#f1f5f9',
                }}
              >
                <span
                  title={`${activeTab.fileName}.metatext.jsonc`}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {activeTab.fileName}.metatext.jsonc
                </span>
                <button
                  type="button"
                  title="Copy JSONC"
                  onClick={() => {
                    void navigator.clipboard?.writeText(activeTab.metaText ?? '');
                    setMetaCopied(true);
                    window.setTimeout(() => setMetaCopied(false), 1200);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    fontSize: 11,
                    borderRadius: 4,
                    border: `1px solid ${border}`,
                    background: 'transparent',
                    color: barFg,
                    cursor: 'pointer',
                  }}
                >
                  {metaCopied ? <Check size={11} /> : <Copy size={11} />}
                  <span>{metaCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  aria-label="Close .metatext.jsonc panel"
                  title="Close panel"
                  onClick={() => setShowMetaPanel(false)}
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
                    color: barFg,
                    opacity: 0.75,
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <textarea
                value={activeTab.metaText ?? ''}
                onChange={(e) => handleMetaPanelEdit(activeTab, e.target.value)}
                spellCheck={false}
                placeholder="// Sidecar .metatext.jsonc (live synced with grid & disk)"
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  padding: 10,
                  background: isDark ? '#141416' : '#ffffff',
                  color: barFg,
                  fontFamily: "'Consolas', 'Courier New', monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              />
            </aside>
          )}
        </div>
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
          title="About MetaText Editor"
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
        <div style={{ fontSize: 20, fontWeight: 700 }}>MetaText Editor</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          CSV / TSV / JSONL / LOG を開くと、隣の .metatext.jsonc を自動で読み書きします
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
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
            ファイルを開く (CSV / JSONL / LOG)
          </button>
          <button
            type="button"
            style={{
              ...btnStyle,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 600,
            }}
            onClick={handleNewTab}
          >
            新規作成 (CSV)
          </button>
        </div>
      </div>

      <SettingsModal
        open={showEmptySettings}
        onClose={() => setShowEmptySettings(false)}
        hostMode="desktop"
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
