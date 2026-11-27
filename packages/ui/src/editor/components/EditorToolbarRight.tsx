import React from 'react';
import { FileText, History, Info, Lock, Package, Settings, Unlock } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';
import { FoxTailIcon } from '../../icons/FoxTailIcon';
import { ZebraRowsIcon } from '../../icons/ZebraRowsIcon';
import { useI18n } from '../../i18n';

export interface EditorToolbarRightProps {
  isDark: boolean;
  toolbarBorder: string;
  btnStyle: React.CSSProperties;
  isReadOnly: boolean;
  activeFormat: MetaTextFormat;
  openMenu: 'none' | 'file' | 'edit' | 'unlock';
  canTail: boolean;
  showTailPanel: boolean;
  zebraEnabled: boolean;
  showCellInspector: boolean;
  showHistoryPanel: boolean;
  savingSnapshot?: boolean;
  onToggleUnlockPopover: () => void;
  onLockReadOnly: () => void;
  onUnlockEditing: () => void;
  onCloseMenu: () => void;
  onToggleTailPanel: () => void;
  onToggleZebra: () => void;
  onToggleCellInspector: () => void;
  onToggleHistoryPanel: () => void;
  onOpenExportBundle?: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}

export const EditorToolbarRight: React.FC<EditorToolbarRightProps> = ({
  isDark,
  toolbarBorder,
  btnStyle,
  isReadOnly,
  activeFormat,
  openMenu,
  canTail,
  showTailPanel,
  zebraEnabled,
  showCellInspector,
  showHistoryPanel,
  savingSnapshot = false,
  onToggleUnlockPopover,
  onLockReadOnly,
  onUnlockEditing,
  onCloseMenu,
  onToggleTailPanel,
  onToggleZebra,
  onToggleCellInspector,
  onToggleHistoryPanel,
  onOpenExportBundle,
  onOpenSettings,
  onOpenAbout,
}) => {
  const { t } = useI18n();
  return (
  <div
    style={{
      marginLeft: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      position: 'relative',
    }}
  >
    {(isReadOnly || activeFormat === 'jsonl' || activeFormat === 'log') && (
      <button
        type="button"
        title={isReadOnly ? t('toolbar.readOnlyTooltip') : t('toolbar.unlockedTooltip')}
        aria-label={isReadOnly ? t('toolbar.readOnlyAria') : t('toolbar.unlockedAria')}
        style={{
          ...btnStyle,
          padding: '3px 8px',
          borderColor: isReadOnly
            ? '#f59e0b'
            : openMenu === 'unlock'
              ? '#3b82f6'
              : '#10b981',
          background: isReadOnly
            ? isDark
              ? 'rgba(245, 158, 11, 0.16)'
              : 'rgba(245, 158, 11, 0.14)'
            : isDark
              ? 'rgba(16, 185, 129, 0.14)'
              : 'rgba(16, 185, 129, 0.12)',
          color: isReadOnly
            ? isDark
              ? '#fcd34d'
              : '#b45309'
            : isDark
              ? '#6ee7b7'
              : '#047857',
          fontWeight: 600,
        }}
        onClick={() => {
          if (isReadOnly) {
            onToggleUnlockPopover();
          } else {
            onLockReadOnly();
          }
        }}
      >
        {isReadOnly ? <Lock size={12} /> : <Unlock size={12} />}
        <span>{isReadOnly ? t('toolbar.readOnly') : t('toolbar.unlocked')}</span>
      </button>
    )}
    {canTail && (
      <button
        type="button"
        aria-label={t('toolbar.liveTailAria')}
        title={showTailPanel ? t('toolbar.liveTailOnTooltip') : t('toolbar.liveTailOffTooltip')}
        style={{
          ...btnStyle,
          padding: '3px 6px',
          borderColor: showTailPanel ? '#10b981' : toolbarBorder,
          background: showTailPanel
            ? isDark
              ? 'rgba(16, 185, 129, 0.22)'
              : 'rgba(16, 185, 129, 0.14)'
            : btnStyle.background,
          color: showTailPanel
            ? isDark
              ? '#6ee7b7'
              : '#047857'
            : btnStyle.color,
        }}
        onClick={onToggleTailPanel}
      >
        <FoxTailIcon size={15} />
      </button>
    )}
    <button
      type="button"
      aria-label={t('toolbar.zebraAria')}
      title={zebraEnabled ? t('toolbar.zebraOnTooltip') : t('toolbar.zebraOffTooltip')}
      style={{
        ...btnStyle,
        padding: '3px 6px',
        borderColor: zebraEnabled ? '#3b82f6' : toolbarBorder,
        background: zebraEnabled
          ? isDark
            ? 'rgba(59, 130, 246, 0.2)'
            : 'rgba(59, 130, 246, 0.12)'
          : btnStyle.background,
      }}
      onClick={onToggleZebra}
    >
      <ZebraRowsIcon size={14} active={zebraEnabled} />
    </button>
    <button
      type="button"
      aria-label={t('toolbar.inspectorAria')}
      title={t('toolbar.inspectorTooltip')}
      style={{
        ...btnStyle,
        padding: '3px 6px',
        borderColor: showCellInspector ? '#3b82f6' : toolbarBorder,
        background: showCellInspector
          ? isDark
            ? 'rgba(59, 130, 246, 0.2)'
            : 'rgba(59, 130, 246, 0.12)'
          : btnStyle.background,
      }}
      onClick={onToggleCellInspector}
    >
      <FileText size={14} />
    </button>
    <button
      type="button"
      aria-label="History panel"
      title={
        savingSnapshot
          ? 'Saving snapshot...'
          : showHistoryPanel
            ? 'Hide History panel'
            : 'Show History panel'
      }
      style={{
        ...btnStyle,
        padding: '3px 6px',
        borderColor: savingSnapshot
          ? '#f59e0b'
          : showHistoryPanel
            ? '#3b82f6'
            : toolbarBorder,
        background: savingSnapshot
          ? isDark
            ? 'rgba(245, 158, 11, 0.22)'
            : 'rgba(245, 158, 11, 0.16)'
          : showHistoryPanel
            ? isDark
              ? 'rgba(59, 130, 246, 0.2)'
              : 'rgba(59, 130, 246, 0.12)'
            : btnStyle.background,
        color: savingSnapshot
          ? isDark
            ? '#fbbf24'
            : '#d97706'
          : btnStyle.color,
      }}
      onClick={onToggleHistoryPanel}
    >
      <History size={14} />
    </button>
    {onOpenExportBundle && (
      <button
        type="button"
        aria-label="Export as .metatext.zip"
        title="Export as .metatext.zip"
        style={{ ...btnStyle, padding: '3px 6px' }}
        onClick={onOpenExportBundle}
      >
        <Package size={14} />
      </button>
    )}
    <button
      type="button"
      aria-label={t('common.settings')}
      title={t('toolbar.settingsTooltip')}
      style={{ ...btnStyle, padding: '3px 6px' }}
      onClick={onOpenSettings}
    >
      <Settings size={14} />
    </button>
    <button
      type="button"
      aria-label={t('toolbar.aboutTitle')}
      title={t('toolbar.aboutTitle')}
      style={{ ...btnStyle, padding: '3px 6px' }}
      onClick={onOpenAbout}
    >
      <Info size={14} />
    </button>

    {openMenu === 'unlock' && isReadOnly && (
      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          zIndex: 65,
          width: 270,
          padding: 12,
          borderRadius: 6,
          background: isDark ? '#1f1f23' : '#ffffff',
          border: `1px solid ${toolbarBorder}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.34)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <Lock size={13} />
          <span>{t('toolbar.unlockTitle')}</span>
        </div>
        <div style={{ opacity: 0.8, lineHeight: 1.45, fontSize: 11.5 }}>
          {t('toolbar.unlockBody')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
          <button type="button" style={btnStyle} onClick={onCloseMenu}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            style={{
              ...btnStyle,
              background: '#d97706',
              borderColor: '#f59e0b',
              color: '#ffffff',
              fontWeight: 600,
            }}
            onClick={onUnlockEditing}
          >
            <Unlock size={12} />
            <span>{t('toolbar.unlockConfirm')}</span>
          </button>
        </div>
      </div>
    )}
  </div>
  );
};
