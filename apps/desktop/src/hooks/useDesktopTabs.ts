import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  EditorAppSettings,
  EditorStatusInfo,
  EditorViewSnapshot,
  MetaTextEditorHandle,
  ThemePreference,
} from '@metatext-editor/ui';
import {
  createTauriAdapter,
  createUntitledDesktopAdapter,
  saveFileStreamViaTauri,
  type DesktopFileSystemAdapter,
} from '../tauriAdapter';
import {
  extractFileName,
  getParentDirectory,
  normalizePathKey,
} from '../utils/pathUtils';

export interface DesktopAppSettings extends EditorAppSettings {
  theme: ThemePreference;
  lastDirectory?: string | null;
  lastOpenedFiles?: string[] | null;
  lastActiveFile?: string | null;
}

export interface DesktopTab {
  id: string;
  filePath: string | null;
  fileName: string;
  dirty: boolean;
  adapter: DesktopFileSystemAdapter;
  sleeping: boolean;
  lastAccessedAt: number;
  fileBytes: number;
  metaText?: string;
  viewSnapshot?: EditorViewSnapshot;
}

const MAX_AWAKE_TAB_BYTES = 40 * 1024 * 1024;
const MAX_AWAKE_TABS = 5;

const SAVE_DIALOG_FILTERS = [
  { name: 'CSV', extensions: ['csv'] },
  { name: 'TSV', extensions: ['tsv'] },
  { name: 'JSONL', extensions: ['jsonl', 'ndjson'] },
  { name: 'Log / Text', extensions: ['log', 'txt'] },
  { name: 'All Files', extensions: ['*'] },
];

export function useDesktopTabs() {
  const [tabs, setTabs] = useState<DesktopTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [themePref, setThemePref] = useState<ThemePreference>('system');
  const [lastDirectory, setLastDirectory] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({});

  const metaPanelSaveTimerRef = useRef<number | null>(null);
  const sessionReadyRef = useRef(false);
  const lastPersistedSessionKeyRef = useRef<string>('');
  const nextTabIdRef = useRef(1);
  const lastDirRef = useRef<string | undefined>(undefined);
  const tabsRef = useRef<DesktopTab[]>([]);
  const editorRefs = useRef<Map<string, MetaTextEditorHandle>>(new Map());
  tabsRef.current = tabs;
  lastDirRef.current = lastDirectory;

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
        return { ...t, sleeping: true, viewSnapshot: snapshot };
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
          ? prev.map((t) => (t.id === prevActiveId ? { ...t, viewSnapshot: prevSnapshot } : t))
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
    invoke('update_app_settings', { lastDirectory: dir }).catch(() => {});
  }, []);

  const commitSaveAsDestination = useCallback(
    (tabId: string, selected: string, fileBytes: number) => {
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      const normDest = normalizePathKey(selected);
      const nextName = extractFileName(selected);
      currentTab?.adapter.setFilePath(selected);

      setTabs((prev) => {
        const next = prev
          .filter(
            (t) => t.id === tabId || !t.filePath || normalizePathKey(t.filePath) !== normDest,
          )
          .map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  filePath: selected,
                  fileName: nextName,
                  dirty: false,
                  sleeping: false,
                  fileBytes,
                }
              : t,
          );
        return applyMemoryBudget(next, tabId);
      });
      setActiveTabId(tabId);
      updateLastDirectory(selected);
    },
    [applyMemoryBudget, updateLastDirectory],
  );

  const saveTabAs = useCallback(
    async (tabId: string, bytes: Uint8Array, metaText: string): Promise<boolean> => {
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      const defaultPath =
        currentTab?.filePath ??
        (lastDirRef.current ? `${lastDirRef.current}\\untitled.csv` : 'untitled.csv');
      const selected = await save({ defaultPath, filters: SAVE_DIALOG_FILTERS });
      if (typeof selected !== 'string' || selected.length === 0) return false;

      await invoke('save_csv_raw', bytes, {
        headers: { 'x-file-path': encodeURIComponent(selected) },
      });
      if (metaText.trim().length > 0) {
        await invoke('save_meta_text', { path: selected, metaText });
      }
      commitSaveAsDestination(tabId, selected, bytes.byteLength);
      return true;
    },
    [commitSaveAsDestination],
  );

  const saveTabAsStream = useCallback(
    async (
      tabId: string,
      chunks: Iterable<Uint8Array>,
      metaText: string,
    ): Promise<boolean> => {
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      const defaultPath =
        currentTab?.filePath ??
        (lastDirRef.current ? `${lastDirRef.current}\\untitled.csv` : 'untitled.csv');
      const selected = await save({ defaultPath, filters: SAVE_DIALOG_FILTERS });
      if (typeof selected !== 'string' || selected.length === 0) return false;

      const totalBytes = await saveFileStreamViaTauri(selected, chunks);
      if (metaText.trim().length > 0) {
        await invoke('save_meta_text', { path: selected, metaText });
      }
      commitSaveAsDestination(tabId, selected, totalBytes);
      return true;
    },
    [commitSaveAsDestination],
  );

  const openFilePathsInTabs = useCallback(
    (paths: string[], preferredActivePath?: string | null) => {
      if (paths.length === 0) return;
      let targetActiveId: string | null = null;
      const existing = tabsRef.current;
      const toAdd: DesktopTab[] = [];
      const now = Date.now();
      const normPreferred = preferredActivePath ? normalizePathKey(preferredActivePath) : null;

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
          if (i === activeIndex || targetActiveId === null) targetActiveId = found.id;
        } else {
          const alreadyAdded = toAdd.find(
            (t) => t.filePath && normalizePathKey(t.filePath) === norm,
          );
          if (alreadyAdded) {
            if (i === activeIndex || targetActiveId === null) targetActiveId = alreadyAdded.id;
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
            if (isTargetActive || targetActiveId === null) targetActiveId = id;
          }
        }
      }

      if (toAdd.length > 0 || targetActiveId) {
        setTabs((prev) => applyMemoryBudget([...prev, ...toAdd], targetActiveId));
      }
      if (targetActiveId) setActiveTabId(targetActiveId);
      updateLastDirectory(paths[activeIndex] ?? paths[paths.length - 1]!);
    },
    [updateLastDirectory, applyMemoryBudget],
  );

  const handleNewTab = useCallback(() => {
    const id = `tab-${nextTabIdRef.current++}`;
    const adapter = createUntitledDesktopAdapter(
      (bytes, metaText) => saveTabAs(id, bytes, metaText),
      (chunks, metaText) => saveTabAsStream(id, chunks, metaText),
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
  }, [saveTabAs, saveTabAsStream, applyMemoryBudget]);

  const closeTab = useCallback(
    (tabId: string, skipConfirm = false) => {
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
    },
    [activeTabId, applyMemoryBudget],
  );

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
        if (settings.lastDirectory) setLastDirectory(settings.lastDirectory);
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

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  useEffect(() => {
    const title = activeTab
      ? `MetaText Editor - ${activeTab.fileName}${activeTab.dirty ? ' *' : ''}`
      : 'MetaText Editor';
    invoke('set_window_title', { title }).catch(() => {});
  }, [activeTab?.id, activeTab?.fileName, activeTab?.dirty]);

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
    }).catch(() => {});
  }, [tabs, activeTab?.filePath]);

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

  const handleThemeChange = useCallback((next: ThemePreference) => {
    setThemePref(next);
    invoke('update_app_settings', { theme: next }).catch(() => {});
  }, []);

  const handleAppSettingsChange = useCallback((patch: Partial<EditorAppSettings>) => {
    setAppSettings((prev) => ({ ...prev, ...patch }));
    invoke('update_app_settings', patch).catch(() => {});
  }, []);

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: true,
      defaultPath: lastDirectory,
      filters: [
        {
          name: 'CSV / TSV / JSONL / Log',
          extensions: ['csv', 'tsv', 'jsonl', 'ndjson', 'log', 'txt'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (typeof selected === 'string') {
      openFilePathsInTabs([selected]);
    } else if (Array.isArray(selected) && selected.length > 0) {
      openFilePathsInTabs(selected.filter((p): p is string => typeof p === 'string'));
    }
  }, [lastDirectory, openFilePathsInTabs]);

  const handleMetaPanelEdit = useCallback((tab: DesktopTab, nextText: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, metaText: nextText } : t)));
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

  const handleTabMetaTextChange = useCallback((tabId: string, nextMeta: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId && t.metaText !== nextMeta ? { ...t, metaText: nextMeta } : t)),
    );
  }, []);

  const handleTabStatusChange = useCallback(
    (tabId: string, info: EditorStatusInfo) => {
      const nextBytes = info.fileBytes ?? 0;
      setTabs((prev) => {
        const cur = prev.find((t) => t.id === tabId);
        if (!cur) return prev;
        const changed =
          cur.dirty !== info.dirty ||
          (info.fileName && cur.fileName !== info.fileName) ||
          (nextBytes > 0 && cur.fileBytes !== nextBytes);
        if (!changed) return prev;
        const updated = prev.map((t) =>
          t.id === tabId
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
    },
    [applyMemoryBudget, activeTabId],
  );

  return {
    tabs,
    activeTabId,
    activeTab,
    themePref,
    appSettings,
    editorRefs,
    activateTab,
    closeTab,
    handleNewTab,
    handleOpenFile,
    openFilePathsInTabs,
    saveTabAs,
    saveTabAsStream,
    handleThemeChange,
    handleAppSettingsChange,
    handleMetaPanelEdit,
    handleTabMetaTextChange,
    handleTabStatusChange,
  };
}
