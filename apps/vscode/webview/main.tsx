import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  I18nProvider,
  MetaTextEditor,
  type EditorAppSettings,
  type MetaTextEditorHandle,
} from '@metatext-editor/ui';
import { createVsCodeAdapter } from './vscodeAdapter';

const VsCodeApp: React.FC = () => {
  const {
    adapter,
    historyAdapter,
    onThemeMode,
    onHostLanguage,
    onAppSettings,
    onShowHistoryPanel,
    onHostCommand,
    respondCsvData,
    notifyEdit,
    notifyStatus,
    updateSettings,
    setShowHistoryPanel: persistShowHistoryPanel,
    openSettings,
    exportBundle,
  } = useMemo(() => createVsCodeAdapter(), []);
  const editorRef = useRef<MetaTextEditorHandle | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.body.classList.contains('vscode-light') ? 'light' : 'dark',
  );
  const [hostLanguage, setHostLanguage] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({});
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [externalSavingSnapshot, setExternalSavingSnapshot] = useState(false);

  useEffect(() => onThemeMode(setThemeMode), [onThemeMode]);
  useEffect(() => onHostLanguage(setHostLanguage), [onHostLanguage]);
  useEffect(() => onAppSettings(setAppSettings), [onAppSettings]);
  useEffect(() => onShowHistoryPanel(setShowHistoryPanel), [onShowHistoryPanel]);
  useEffect(
    () =>
      onHostCommand((cmd) => {
        const ed = editorRef.current;
        if (!ed) return;
        switch (cmd.command) {
          case 'undo':
            ed.undo();
            break;
          case 'redo':
            ed.redo();
            break;
          case 'reload':
            ed.reload();
            break;
          case 'hostSaved':
            ed.markClean();
            break;
          case 'requestCsvData':
            if (cmd.requestId !== undefined) {
              respondCsvData(cmd.requestId, ed.serializeCurrentCsv());
            }
            break;
          case 'setZoom':
            if (typeof cmd.scale === 'number') {
              ed.setZoomScale(cmd.scale);
            }
            break;
          case 'historySaving':
            setExternalSavingSnapshot(Boolean(cmd.saving));
            break;
          case 'historyUpdated':
            setHistoryRefreshTick((t) => t + 1);
            break;
        }
      }),
    [onHostCommand, respondCsvData],
  );

  return (
    <I18nProvider preference={appSettings.language} systemLanguage={hostLanguage}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <MetaTextEditor
          ref={editorRef}
          adapter={adapter}
          historyAdapter={historyAdapter}
          filePath="vscode-document"
          hostMode="vscode"
          themeMode={themeMode}
          appSettings={appSettings}
          onAppSettingsChange={(patch) => {
            setAppSettings((prev) => ({ ...prev, ...patch }));
            updateSettings(patch);
          }}
          onOpenSettings={openSettings}
          onExportBundle={exportBundle}
          showHistoryPanel={showHistoryPanel}
          onToggleHistoryPanel={() => {
            setShowHistoryPanel((prev) => {
              const next = !prev;
              persistShowHistoryPanel(next);
              return next;
            });
          }}
          historyRefreshTick={historyRefreshTick}
          externalSavingSnapshot={externalSavingSnapshot}
          onDocumentEdit={notifyEdit}
          onStatusChange={notifyStatus}
        />
      </div>
    </I18nProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VsCodeApp />
  </React.StrictMode>,
);
