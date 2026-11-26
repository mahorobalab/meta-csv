import React from 'react';
import { FilePlus, FolderOpen, Redo2, Save, SaveAll, Undo2, X } from 'lucide-react';
import type { MetaTextFormat } from '@meta-csv/schema';
import type { EditorHostMode } from '../../SettingsAboutDialogs';

export interface FileMenuPopoverProps {
  hostMode: EditorHostMode;
  isDark: boolean;
  toolbarBorder: string;
  menuItemStyle: React.CSSProperties;
  activeFormat: MetaTextFormat;
  isReadOnly: boolean;
  dirtyCsv: boolean;
  hasCsvData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveAs?: () => void;
  onCloseFile?: () => void;
  onSaveCsv: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCloseMenu: () => void;
  fileMenuItems?: React.ReactNode;
}

export const FileMenuPopover: React.FC<FileMenuPopoverProps> = ({
  hostMode,
  isDark,
  toolbarBorder,
  menuItemStyle,
  activeFormat,
  isReadOnly,
  dirtyCsv,
  hasCsvData,
  canUndo,
  canRedo,
  onNewFile,
  onOpenFile,
  onSaveAs,
  onCloseFile,
  onSaveCsv,
  onUndo,
  onRedo,
  onCloseMenu,
  fileMenuItems,
}) => {
  const saveLabel =
    activeFormat === 'jsonl'
      ? hostMode === 'web'
        ? 'Save / Download JSONL'
        : 'Save JSONL'
      : activeFormat === 'log' || activeFormat === 'text'
        ? hostMode === 'web'
          ? 'Save / Download Log'
          : 'Save Log'
        : hostMode === 'web'
          ? 'Save / Download CSV'
          : 'Save CSV';

  const saveDisabled = isReadOnly || (!dirtyCsv && hostMode === 'desktop');

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 2px)',
        left: 10,
        zIndex: 60,
        width: 240,
        padding: 6,
        borderRadius: 6,
        background: isDark ? '#1f1f23' : '#ffffff',
        border: `1px solid ${toolbarBorder}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {onNewFile && (
        <button
          type="button"
          style={menuItemStyle}
          onClick={() => {
            onCloseMenu();
            onNewFile();
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <FilePlus size={14} />
            <span>New File</span>
          </span>
          <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+N</span>
        </button>
      )}
      {onOpenFile && (
        <button
          type="button"
          style={menuItemStyle}
          onClick={() => {
            onCloseMenu();
            onOpenFile();
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <FolderOpen size={14} />
            <span>Open File...</span>
          </span>
        </button>
      )}
      <button
        type="button"
        style={{
          ...menuItemStyle,
          opacity: saveDisabled ? 0.45 : 1,
        }}
        disabled={saveDisabled}
        onClick={() => {
          onCloseMenu();
          onSaveCsv();
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Save size={14} />
          <span>{saveLabel}</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+S</span>
      </button>
      {onSaveAs && (
        <button
          type="button"
          style={{
            ...menuItemStyle,
            opacity: hasCsvData ? 1 : 0.45,
          }}
          disabled={!hasCsvData}
          onClick={() => {
            onCloseMenu();
            onSaveAs();
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <SaveAll size={14} />
            <span>Save As...</span>
          </span>
          <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+S</span>
        </button>
      )}
      {onCloseFile && (
        <button
          type="button"
          style={menuItemStyle}
          onClick={() => {
            onCloseMenu();
            onCloseFile();
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <X size={14} />
            <span>Close File</span>
          </span>
          <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+W</span>
        </button>
      )}
      <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '3px 0' }} />
      <button
        type="button"
        style={{
          ...menuItemStyle,
          opacity: !isReadOnly && canUndo ? 1 : 0.45,
        }}
        disabled={isReadOnly || !canUndo}
        onClick={() => {
          onCloseMenu();
          onUndo();
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Undo2 size={14} />
          <span>Undo</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Z</span>
      </button>
      <button
        type="button"
        style={{
          ...menuItemStyle,
          opacity: !isReadOnly && canRedo ? 1 : 0.45,
        }}
        disabled={isReadOnly || !canRedo}
        onClick={() => {
          onCloseMenu();
          onRedo();
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Redo2 size={14} />
          <span>Redo</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Y</span>
      </button>
      {fileMenuItems && (
        <>
          <hr style={{ border: 'none', borderTop: `1px solid ${toolbarBorder}`, margin: '3px 0' }} />
          <div onClick={onCloseMenu}>{fileMenuItems}</div>
        </>
      )}
    </div>
  );
};
