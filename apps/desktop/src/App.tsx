import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { MetaCsvEditor } from '@meta-csv/ui';
import { createTauriAdapter } from './tauriAdapter';

export const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    invoke<string | null>('get_initial_file')
      .then((initial) => {
        if (initial) setFilePath(initial);
      })
      .catch(() => {
        // Ignore when running outside Tauri
      });
  }, []);

  const adapter = useMemo(
    () => (filePath ? createTauriAdapter(filePath) : null),
    [filePath],
  );

  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'CSV / TSV', extensions: ['csv', 'tsv', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (typeof selected === 'string') {
      setFilePath(selected);
    }
  };

  const isDark = themeMode === 'dark';
  const barBg = isDark ? '#18181b' : '#e2e8f0';
  const barFg = isDark ? '#f8fafc' : '#0f172a';
  const border = isDark ? '#333338' : '#cbd5e1';

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${border}`,
    background: isDark ? '#27272a' : '#ffffff',
    color: barFg,
    cursor: 'pointer',
  };

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
        <strong>MetaCSV</strong>
        <button style={btnStyle} onClick={() => void handleOpenFile()}>
          Open CSV...
        </button>
        {filePath && (
          <span
            style={{
              fontSize: 12,
              opacity: 0.75,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={filePath}
          >
            {filePath}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button
            style={btnStyle}
            onClick={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
          >
            Theme: {themeMode}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0 }}>
        {adapter ? (
          <MetaCsvEditor adapter={adapter} themeMode={themeMode} />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              opacity: 0.85,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600 }}>MetaCSV Desktop</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              CSV を開くと、隣の .meta.jsonc を自動で読み書きします
            </div>
            <button
              style={{
                ...btnStyle,
                padding: '8px 18px',
                fontSize: 14,
                background: '#2563eb',
                borderColor: '#3b82f6',
                color: '#ffffff',
              }}
              onClick={() => void handleOpenFile()}
            >
              CSV ファイルを開く
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
