import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Code2, Info, Settings } from 'lucide-react';
import {
  AboutModal,
  MetaTextEditor,
  SettingsModal,
  resolveThemeMode,
  useSystemTheme,
  type NativeClipboardBridge,
} from '@metatext-editor/ui';
import { useDesktopTabs } from './hooks/useDesktopTabs';
import { DesktopTabBar } from './components/DesktopTabBar';
import { MetaJsoncSidePanel } from './components/MetaJsoncSidePanel';

export const App: React.FC = () => {
  const {
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
    saveTabAs,
    saveTabAsStream,
    handleThemeChange,
    handleAppSettingsChange,
    handleMetaPanelEdit,
    handleTabMetaTextChange,
    handleTabStatusChange,
  } = useDesktopTabs();

  const [showEmptySettings, setShowEmptySettings] = useState(false);
  const [showEmptyAbout, setShowEmptyAbout] = useState(false);
  const [showMetaPanel, setShowMetaPanel] = useState(false);

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
      <button type="button" style={menuRowStyle} onClick={() => setShowMetaPanel((s) => !s)}>
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
        <DesktopTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          tabBarBg={tabBarBg}
          tabActiveBg={tabActiveBg}
          tabInactiveBg={tabInactiveBg}
          barFg={barFg}
          border={border}
          onActivateTab={activateTab}
          onCloseTab={(id) => closeTab(id)}
          onNewTab={handleNewTab}
        />

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
                  <MetaTextEditor
                    ref={(handle) => {
                      if (handle) editorRefs.current.set(tab.id, handle);
                      else editorRefs.current.delete(tab.id);
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
                    onSaveAsStream={(chunks, metaText) => saveTabAsStream(tab.id, chunks, metaText)}
                    onCloseFile={() => closeTab(tab.id, true)}
                    fileMenuItems={fileMenuItems}
                    settingsExtraSection={settingsExtraSection}
                    nativeClipboard={nativeClipboard}
                    externalMetaText={tab.metaText}
                    onMetaTextChange={(nextMeta) => handleTabMetaTextChange(tab.id, nextMeta)}
                    onStatusChange={(info) => handleTabStatusChange(tab.id, info)}
                  />
                </div>
              );
            })}
          </div>

          {showMetaPanel && activeTab && (
            <MetaJsoncSidePanel
              fileName={activeTab.fileName}
              metaText={activeTab.metaText ?? ''}
              isDark={isDark}
              barFg={barFg}
              border={border}
              onChangeMetaText={(nextText) => handleMetaPanelEdit(activeTab, nextText)}
              onClose={() => setShowMetaPanel(false)}
            />
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
