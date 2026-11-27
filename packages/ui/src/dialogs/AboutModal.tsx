import React, { useEffect, useState } from 'react';
import { ExternalLink, Info, Scale, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { AboutModalProps } from './types';

interface OssLicenseEntry {
  name: string;
  license: string;
  url: string;
  note?: string;
}

const OSS_LICENSES: OssLicenseEntry[] = [
  {
    name: 'React / React DOM',
    license: 'MIT',
    url: 'https://github.com/facebook/react',
    note: 'UI component library',
  },
  {
    name: '@glideapps/glide-data-grid',
    license: 'MIT',
    url: 'https://github.com/glideapps/glide-data-grid',
    note: 'High-performance Canvas data grid',
  },
  {
    name: 'PapaParse',
    license: 'MIT',
    url: 'https://github.com/mholt/PapaParse',
    note: 'CSV/TSV parser and serializer',
  },
  {
    name: 'jsonc-parser',
    license: 'MIT',
    url: 'https://github.com/microsoft/node-jsonc-parser',
    note: 'Comment-preserving JSONC parser & editor',
  },
  {
    name: 'numfmt',
    license: 'MIT',
    url: 'https://github.com/borgar/numfmt',
    note: 'Spreadsheet number & date formatting',
  },
  {
    name: 'Lucide React',
    license: 'ISC',
    url: 'https://github.com/lucide-icons/lucide',
    note: 'Icon set',
  },
  {
    name: 'Lodash',
    license: 'MIT',
    url: 'https://github.com/lodash/lodash',
    note: 'Utility helpers',
  },
  {
    name: 'Marked',
    license: 'MIT',
    url: 'https://github.com/markedjs/marked',
    note: 'Markdown parser (Glide Data Grid peer)',
  },
  {
    name: 'Tauri',
    license: 'MIT / Apache-2.0',
    url: 'https://github.com/tauri-apps/tauri',
    note: 'Desktop application framework',
  },
  {
    name: 'Serde / serde_json',
    license: 'MIT / Apache-2.0',
    url: 'https://github.com/serde-rs/serde',
    note: 'Rust serialization framework (Desktop)',
  },
  {
    name: 'arboard',
    license: 'MIT / Apache-2.0',
    url: 'https://github.com/1Password/arboard',
    note: 'Cross-platform native clipboard (Desktop)',
  },
  {
    name: 'Vite',
    license: 'MIT',
    url: 'https://github.com/vitejs/vite',
    note: 'Frontend build tool',
  },
  {
    name: 'Game-icons.net — Fox Tail (Delapouite)',
    license: 'CC BY 3.0',
    url: 'https://game-icons.net/1x1/delapouite/fox-tail.html',
    note: 'Live Tail icon (modified: flipped horizontally & recolored)',
  },
];

export const AboutModal: React.FC<AboutModalProps> = ({
  open,
  onClose,
  themeMode,
  hostMode,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'about' | 'licenses'>('about');

  useEffect(() => {
    if (!open) return;
    setActiveTab('about');
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
      ? t('about.envVscode')
      : hostMode === 'desktop'
        ? t('about.envDesktop')
        : t('about.envWeb');

  const shortcuts: Array<[string, string]> = [
    ['F2', t('about.shortcutEdit')],
    ['Tab / Enter', t('about.shortcutMove')],
    ['Ctrl+M / Ctrl+F2', t('about.shortcutMarker')],
    ['Alt+F2 / Alt+Shift+F2', t('about.shortcutJumpMarker')],
    ['Ctrl+Wheel / Ctrl+0', t('about.shortcutZoom')],
    ['Ctrl+S', t('about.shortcutSave')],
    ['Ctrl+Z / Ctrl+Y', t('about.shortcutUndo')],
  ];

  const tabBtnStyle = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: selected ? 600 : 500,
    borderRadius: 5,
    border: `1px solid ${selected ? '#3b82f6' : 'transparent'}`,
    background: selected ? (isDark ? 'rgba(59,130,246,0.18)' : '#dbeafe') : 'transparent',
    color: selected ? (isDark ? '#93c5fd' : '#1d4ed8') : fg,
    cursor: 'pointer',
  });

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
        aria-label={t('about.title')}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '82vh',
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
            <span>{t('about.title')}</span>
          </div>
          <button
            type="button"
            aria-label={t('about.closeAria')}
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

        {/* Tabs */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: `1px solid ${border}`,
            paddingBottom: 8,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'about'}
            style={tabBtnStyle(activeTab === 'about')}
            onClick={() => setActiveTab('about')}
          >
            <Info size={13} />
            <span>{t('about.tabAbout')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'licenses'}
            style={tabBtnStyle(activeTab === 'licenses')}
            onClick={() => setActiveTab('licenses')}
          >
            <Scale size={13} />
            <span>{t('about.tabLicenses')}</span>
          </button>
        </div>

        {activeTab === 'about' ? (
          <>
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
                {t('about.description')}
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
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
                {t('about.shortcutsTitle')}
              </div>
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
                <span>{t('about.website')}</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
              {t('about.licenseFooter')}
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              overflowY: 'auto',
              maxHeight: 340,
              paddingRight: 2,
            }}
          >
            <div style={{ fontSize: 11.5, opacity: 0.78, marginBottom: 2 }}>
              {t('about.ossIntro')}
            </div>
            {OSS_LICENSES.map((pkg) => (
              <div
                key={pkg.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: mutedBg,
                  border: `1px solid ${border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={pkg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: isDark ? '#93c5fd' : '#2563eb',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{pkg.name}</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  {pkg.note && (
                    <div style={{ fontSize: 11, opacity: 0.72, marginTop: 1 }}>{pkg.note}</div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: bg,
                    border: `1px solid ${border}`,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {pkg.license}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
