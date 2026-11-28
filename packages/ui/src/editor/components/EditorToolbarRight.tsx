import React from 'react';
import { FileText, History, Info, Lock, Package, Settings, Unlock } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';
import type { ToolbarIconSize } from '../../dialogs/types';
import { FoxTailIcon } from '../../icons/FoxTailIcon';
import { ZebraRowsIcon } from '../../icons/ZebraRowsIcon';
import { useI18n } from '../../i18n';
import { ToolbarIconButton } from './ToolbarIconButton';

export interface EditorToolbarRightProps {
  isDark: boolean;
  toolbarBorder: string;
  btnStyle: React.CSSProperties;
  iconSize: ToolbarIconSize;
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
  iconSize,
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
  const isLarge = iconSize === 'large';
  const basePx = isLarge ? 20 : 14;
  const tailPx = isLarge ? 21 : 15;
  const fgColor = typeof btnStyle.color === 'string' ? btnStyle.color : undefined;
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
          padding: isLarge ? '4px 10px' : '3px 8px',
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
        {isReadOnly ? <Lock size={isLarge ? 15 : 12} /> : <Unlock size={isLarge ? 15 : 12} />}
        <span>{isReadOnly ? t('toolbar.readOnly') : t('toolbar.unlocked')}</span>
      </button>
    )}
    {canTail && (
      <ToolbarIconButton
        isDark={isDark}
        toolbarBorder={toolbarBorder}
        fgColor={fgColor}
        iconSize={iconSize}
        active={showTailPanel}
        accent="emerald"
        ariaLabel={t('toolbar.liveTailAria')}
        title={showTailPanel ? t('toolbar.liveTailOnTooltip') : t('toolbar.liveTailOffTooltip')}
        onClick={onToggleTailPanel}
      >
        <FoxTailIcon size={tailPx} />
      </ToolbarIconButton>
    )}
    <ToolbarIconButton
      isDark={isDark}
      toolbarBorder={toolbarBorder}
      fgColor={fgColor}
      iconSize={iconSize}
      active={zebraEnabled}
      accent="blue"
      ariaLabel={t('toolbar.zebraAria')}
      title={zebraEnabled ? t('toolbar.zebraOnTooltip') : t('toolbar.zebraOffTooltip')}
      onClick={onToggleZebra}
    >
      <ZebraRowsIcon size={basePx} active={zebraEnabled} />
    </ToolbarIconButton>
    <ToolbarIconButton
      isDark={isDark}
      toolbarBorder={toolbarBorder}
      fgColor={fgColor}
      iconSize={iconSize}
      active={showCellInspector}
      accent="blue"
      ariaLabel={t('toolbar.inspectorAria')}
      title={t('toolbar.inspectorTooltip')}
      onClick={onToggleCellInspector}
    >
      <FileText size={basePx} />
    </ToolbarIconButton>
    <ToolbarIconButton
      isDark={isDark}
      toolbarBorder={toolbarBorder}
      fgColor={fgColor}
      iconSize={iconSize}
      active={savingSnapshot || showHistoryPanel}
      accent={savingSnapshot ? 'amber' : 'blue'}
      ariaLabel="History panel"
      title={
        savingSnapshot
          ? 'Saving snapshot...'
          : showHistoryPanel
            ? 'Hide History panel'
            : 'Show History panel'
      }
      onClick={onToggleHistoryPanel}
    >
      <History size={basePx} />
    </ToolbarIconButton>
    {onOpenExportBundle && (
      <ToolbarIconButton
        isDark={isDark}
        toolbarBorder={toolbarBorder}
        fgColor={fgColor}
        iconSize={iconSize}
        ariaLabel="Export as .metatext.zip"
        title="Export as .metatext.zip"
        onClick={onOpenExportBundle}
      >
        <Package size={basePx} />
      </ToolbarIconButton>
    )}
    <ToolbarIconButton
      isDark={isDark}
      toolbarBorder={toolbarBorder}
      fgColor={fgColor}
      iconSize={iconSize}
      ariaLabel={t('common.settings')}
      title={t('toolbar.settingsTooltip')}
      onClick={onOpenSettings}
    >
      <Settings size={basePx} />
    </ToolbarIconButton>
    <ToolbarIconButton
      isDark={isDark}
      toolbarBorder={toolbarBorder}
      fgColor={fgColor}
      iconSize={iconSize}
      ariaLabel={t('toolbar.aboutTitle')}
      title={t('toolbar.aboutTitle')}
      onClick={onOpenAbout}
    >
      <Info size={basePx} />
    </ToolbarIconButton>

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
