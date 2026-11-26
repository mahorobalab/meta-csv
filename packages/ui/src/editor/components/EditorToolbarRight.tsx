import React from 'react';
import { FileText, Info, Lock, Settings, Unlock } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';
import { ZebraRowsIcon } from '../../icons/ZebraRowsIcon';

export interface EditorToolbarRightProps {
  isDark: boolean;
  toolbarBorder: string;
  btnStyle: React.CSSProperties;
  isReadOnly: boolean;
  activeFormat: MetaTextFormat;
  openMenu: 'none' | 'file' | 'edit' | 'unlock';
  zoomScale: number;
  zebraEnabled: boolean;
  showCellInspector: boolean;
  onToggleUnlockPopover: () => void;
  onLockReadOnly: () => void;
  onUnlockEditing: () => void;
  onCloseMenu: () => void;
  onResetZoom: () => void;
  onToggleZebra: () => void;
  onToggleCellInspector: () => void;
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
  zoomScale,
  zebraEnabled,
  showCellInspector,
  onToggleUnlockPopover,
  onLockReadOnly,
  onUnlockEditing,
  onCloseMenu,
  onResetZoom,
  onToggleZebra,
  onToggleCellInspector,
  onOpenSettings,
  onOpenAbout,
}) => (
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
        title={
          isReadOnly
            ? 'Read-Only mode (click to unlock editing)'
            : 'Editing unlocked (click to re-lock as Read-Only)'
        }
        aria-label={isReadOnly ? 'Read-Only mode' : 'Editing unlocked'}
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
        <span>{isReadOnly ? 'Read-Only' : 'Unlocked'}</span>
      </button>
    )}
    {zoomScale !== 1 && (
      <button
        type="button"
        title="Reset zoom to 100% (Ctrl+0 / Ctrl+Wheel)"
        onClick={onResetZoom}
        style={{
          ...btnStyle,
          padding: '3px 7px',
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        {Math.round(zoomScale * 100)}%
      </button>
    )}
    <button
      type="button"
      aria-label="Alternating Row Colors"
      title={
        zebraEnabled
          ? 'Alternating Row Colors: ON (click to disable)'
          : 'Alternating Row Colors: OFF (click to enable)'
      }
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
      aria-label="Cell Inspector"
      title="Toggle Cell Inspector (view full multiline text / stack trace)"
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
      aria-label="Settings"
      title="Settings (File layout & App)"
      style={{ ...btnStyle, padding: '3px 6px' }}
      onClick={onOpenSettings}
    >
      <Settings size={14} />
    </button>
    <button
      type="button"
      aria-label="About MetaText Editor"
      title="About MetaText Editor"
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
          <span>Unlock Source Editing?</span>
        </div>
        <div style={{ opacity: 0.8, lineHeight: 1.45, fontSize: 11.5 }}>
          This file is currently protected as Read-Only. Sidecar metadata (filters, markers, styles)
          can still be saved without unlocking.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
          <button type="button" style={btnStyle} onClick={onCloseMenu}>
            Cancel
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
            <span>Unlock Editing</span>
          </button>
        </div>
      </div>
    )}
  </div>
);
