import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  MetaCsvEditor,
  type EditorAppSettings,
  type MetaCsvEditorHandle,
} from '@meta-csv/ui';
import { createVsCodeAdapter } from './vscodeAdapter';

const VsCodeApp: React.FC = () => {
  const {
    adapter,
    onThemeMode,
    onAppSettings,
    onHostCommand,
    respondCsvData,
    notifyEdit,
    notifyStatus,
    updateSettings,
    openSettings,
  } = useMemo(() => createVsCodeAdapter(), []);
  const editorRef = useRef<MetaCsvEditorHandle | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.body.classList.contains('vscode-light') ? 'light' : 'dark',
  );
  const [appSettings, setAppSettings] = useState<EditorAppSettings>({});

  useEffect(() => onThemeMode(setThemeMode), [onThemeMode]);
  useEffect(() => onAppSettings(setAppSettings), [onAppSettings]);
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
        }
      }),
    [onHostCommand, respondCsvData],
  );

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MetaCsvEditor
        ref={editorRef}
        adapter={adapter}
        hostMode="vscode"
        themeMode={themeMode}
        appSettings={appSettings}
        onAppSettingsChange={(patch) => {
          setAppSettings((prev) => ({ ...prev, ...patch }));
          updateSettings(patch);
        }}
        onOpenSettings={openSettings}
        onDocumentEdit={notifyEdit}
        onStatusChange={notifyStatus}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VsCodeApp />
  </React.StrictMode>,
);
