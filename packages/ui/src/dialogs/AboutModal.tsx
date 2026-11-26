import React, { useEffect } from 'react';
import { ExternalLink, Info, X } from 'lucide-react';
import type { AboutModalProps } from './types';

export const AboutModal: React.FC<AboutModalProps> = ({
  open,
  onClose,
  themeMode,
  hostMode,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDark = themeMode === 'dark';
  const bg = isDark ? '#1f1f23' : '#ffffff';
  const border = isDark ? '#3c3c42' : '#cbd5e1';
  const fg = isDark ? '#f1f5f9' : '#0f172a';
  const mutedBg = isDark ? '#27272c' : '#f1f5f9';

  const envLabel =
    hostMode === 'vscode'
      ? 'VS Code Extension'
      : hostMode === 'desktop'
        ? 'Desktop App (Tauri)'
        : 'Web / PWA Edition';

  const shortcuts: Array<[string, string]> = [
    ['F2', 'Edit active cell (caret at end)'],
    ['Tab / Enter', 'Move inside selection (Excel-style)'],
    ['Ctrl+M / Ctrl+F2', 'Toggle row marker'],
    ['Alt+F2 / Alt+Shift+F2', 'Jump to next / previous marker'],
    ['Ctrl+Wheel / Ctrl+0', 'Zoom grid in/out / reset 100%'],
    ['Ctrl+S', 'Save file'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ];

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About MetaText Editor"
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 10,
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Info size={16} />
            <span>About MetaText Editor</span>
          </div>
          <button
            type="button"
            aria-label="Close about"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: fg,
              opacity: 0.7,
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>MetaText Editor</strong>
            <span
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 999,
                background: mutedBg,
                border: `1px solid ${border}`,
              }}
            >
              v0.1.0 · {envLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>
            High-performance CSV, TSV, JSONL &amp; Log editor &amp; viewer powered by{' '}
            <code>.metatext.jsonc</code> sidecar metadata.
          </div>
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: mutedBg,
            border: `1px solid ${border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>Keyboard Shortcuts</div>
          {shortcuts.map(([keys, desc]) => (
            <div
              key={keys}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11.5,
              }}
            >
              <span style={{ opacity: 0.85 }}>{desc}</span>
              <code
                style={{
                  fontFamily: "'Consolas', monospace",
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: bg,
                  border: `1px solid ${border}`,
                }}
              >
                {keys}
              </code>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
          <a
            href="https://github.com/mahorobalab/metatext-editor"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#3b82f6',
              textDecoration: 'none',
            }}
          >
            <span>GitHub</span>
            <ExternalLink size={12} />
          </a>
          <a
            href="https://mahorobalab.github.io/metatext-editor/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#3b82f6',
              textDecoration: 'none',
            }}
          >
            <span>Website</span>
            <ExternalLink size={12} />
          </a>
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
          Licensed under the MIT License · © 2026 MahorobaLab. The MetaText Editor name and official
          icons are assets of MahorobaLab.
        </div>
      </div>
    </div>
  );
};
