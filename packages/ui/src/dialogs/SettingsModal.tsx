import React, { useEffect, useState } from 'react';
import { ExternalLink, Settings } from 'lucide-react';
import { useI18n } from '../i18n';
import type { SettingsModalProps } from './types';
import { FileSettingsTab } from './FileSettingsTab';
import { AppSettingsTab } from './AppSettingsTab';
import { DialogButton, DialogShell } from './ui/DialogPrimitives';

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

  const isDark = themeMode === 'dark';
  const border = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#fafafa' : '#09090b';
  const inputBg = isDark ? '#141417' : '#ffffff';

  const inputStyle: React.CSSProperties = {
    padding: '0 10px',
    height: 32,
    fontSize: 13,
    borderRadius: 7,
    border: `1px solid ${border}`,
    background: inputBg,
    color: fg,
  };

  const effectiveTab = fileSettings ? activeTab : 'app';

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDark={isDark}
      title={t('settings.title')}
      icon={<Settings size={16} />}
      ariaLabel={t('settings.ariaLabel')}
      closeAriaLabel={t('settings.closeAria')}
      maxWidth={fileSettings?.format === 'log' || fileSettings?.format === 'text' ? 560 : 480}
      alignTop
    >
      {fileSettings && (
        <div role="tablist" className="mt-dlg-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'file'}
            data-state={effectiveTab === 'file' ? 'active' : 'inactive'}
            className="mt-dlg-tab"
            onClick={() => setActiveTab('file')}
          >
            {t('settings.tabFile')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'app'}
            data-state={effectiveTab === 'app' ? 'active' : 'inactive'}
            className="mt-dlg-tab"
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <DialogButton
            variant="secondary"
            onClick={() => {
              onOpenHostSettings();
              onClose();
            }}
          >
            <Settings size={13} />
            <span>{t('settings.vscodeSettings')}</span>
            <ExternalLink size={12} />
          </DialogButton>
        </div>
      )}
    </DialogShell>
  );
};
