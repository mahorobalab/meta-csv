import React, { useEffect, useState } from 'react';
import { ExternalLink, Settings, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { SettingsModalProps } from './types';
import { FileSettingsTab } from './FileSettingsTab';
import { AppSettingsTab } from './AppSettingsTab';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  hostMode = 'web',
  themeMode,
  themePreference,
  systemTheme = 'dark',
  onThemePreferenceChange,
  appSettings,
  onAppSettingsChange,
  fileSettings,
  onOpenHostSettings,
  extraSection,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'file' | 'app'>(fileSettings ? 'file' : 'app');
  const hasFileSettings = Boolean(fileSettings);

  useEffect(() => {
    if (!open) return;
    setActiveTab(hasFileSettings ? 'file' : 'app');
  }, [open, hasFileSettings]);

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
  const inputBg = isDark ? '#141416' : '#f8fafc';
  const tabBg = isDark ? '#27272d' : '#f1f5f9';

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${border}`,
    background: inputBg,
    color: fg,
  };

  const tabBtnStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: selected ? 700 : 500,
    borderRadius: 6,
    border: `1px solid ${selected ? '#3b82f6' : 'transparent'}`,
    background: selected ? (isDark ? '#1e3a8a' : '#dbeafe') : 'transparent',
    color: selected ? (isDark ? '#ffffff' : '#1d4ed8') : fg,
    cursor: 'pointer',
  });

  const effectiveTab = fileSettings ? activeTab : 'app';

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
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '8vh 16px 16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.ariaLabel')}
        style={{
          width: '100%',
          maxWidth:
            fileSettings?.format === 'log' || fileSettings?.format === 'text' ? 540 : 460,
          maxHeight: '84vh',
          overflowY: 'auto',
          borderRadius: 10,
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Settings size={16} />
            <span>{t('settings.title')}</span>
          </div>
          <button
            type="button"
            aria-label={t('settings.closeAria')}
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

        {fileSettings && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: 3,
              borderRadius: 7,
              background: tabBg,
              border: `1px solid ${border}`,
            }}
          >
            <button
              type="button"
              style={tabBtnStyle(effectiveTab === 'file')}
              onClick={() => setActiveTab('file')}
            >
              {t('settings.tabFile')}
            </button>
            <button
              type="button"
              style={tabBtnStyle(effectiveTab === 'app')}
              onClick={() => setActiveTab('app')}
            >
              {t('settings.tabApp')}
            </button>
          </div>
        )}

        {effectiveTab === 'file' && fileSettings && (
          <FileSettingsTab
            open={open}
            isDark={isDark}
            border={border}
            fg={fg}
            inputBg={inputBg}
            inputStyle={inputStyle}
            fileSettings={fileSettings}
            appSettings={appSettings}
            onAppSettingsChange={onAppSettingsChange}
          />
        )}

        {effectiveTab === 'app' && (
          <AppSettingsTab
            hostMode={hostMode}
            isDark={isDark}
            border={border}
            inputStyle={inputStyle}
            themePreference={themePreference}
            systemTheme={systemTheme}
            onThemePreferenceChange={onThemePreferenceChange}
            appSettings={appSettings}
            onAppSettingsChange={onAppSettingsChange}
            extraSection={extraSection}
          />
        )}

        {hostMode === 'vscode' && onOpenHostSettings && (
          <>
            <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '0' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  onOpenHostSettings();
                  onClose();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${border}`,
                  background: tabBg,
                  color: fg,
                  cursor: 'pointer',
                }}
              >
                <Settings size={13} />
                <span>{t('settings.vscodeSettings')}</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
