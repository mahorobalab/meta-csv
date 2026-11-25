import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MetaCsvEditor } from '@meta-csv/ui';
import { createVsCodeAdapter } from './vscodeAdapter';

const VsCodeApp: React.FC = () => {
  const { adapter, onThemeMode } = useMemo(() => createVsCodeAdapter(), []);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.body.classList.contains('vscode-light') ? 'light' : 'dark',
  );

  useEffect(() => onThemeMode(setThemeMode), [onThemeMode]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MetaCsvEditor adapter={adapter} themeMode={themeMode} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VsCodeApp />
  </React.StrictMode>,
);
