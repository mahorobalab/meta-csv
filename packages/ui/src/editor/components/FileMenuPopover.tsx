import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus, FolderOpen, Package, Redo2, Save, SaveAll, Undo2, X } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';
import type { EditorHostMode } from '../../SettingsAboutDialogs';
import { NEW_FILE_FORMAT_OPTIONS, type NewFileFormat } from '../../newFileTemplates';
import { useI18n } from '../../i18n';

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
  onNewFile?: (format?: NewFileFormat) => void;
  onOpenFile?: () => void;
  onSaveAs?: () => void;
  onOpenExportBundle?: () => void;
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
  onOpenExportBundle,
  onCloseFile,
  onSaveCsv,
  onUndo,
  onRedo,
  onCloseMenu,
  fileMenuItems,
}) => {
  const { t } = useI18n();
  const [showNewFormats, setShowNewFormats] = useState(false);

  const saveLabel =
    activeFormat === 'jsonl'
      ? hostMode === 'web'
        ? t('fileMenu.saveDownloadJsonl')
        : t('fileMenu.saveJsonl')
      : activeFormat === 'log' || activeFormat === 'text'
        ? hostMode === 'web'
          ? t('fileMenu.saveDownloadLog')
          : t('fileMenu.saveLog')
        : hostMode === 'web'
          ? t('fileMenu.saveDownloadCsv')
          : t('fileMenu.saveCsv');

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            type="button"
            style={menuItemStyle}
            onClick={() => setShowNewFormats((v) => !v)}
            title={t('fileMenu.newFileTooltip')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <FilePlus size={14} />
              <span>{t('fileMenu.newFile')}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, opacity: 0.7 }}>
              <span>Ctrl+N</span>
              {showNewFormats ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          </button>
          {showNewFormats && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                marginLeft: 16,
                paddingLeft: 8,
                borderLeft: `1px solid ${toolbarBorder}`,
              }}
            >
              {NEW_FILE_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.format}
                  type="button"
                  style={{ ...menuItemStyle, padding: '4px 8px' }}
                  onClick={() => {
                    setShowNewFormats(false);
                    onCloseMenu();
                    onNewFile(opt.format);
                  }}
                >
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.6 }}>{opt.extension}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
            <span>{t('fileMenu.openFile')}</span>
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
            <span>{t('fileMenu.saveAs')}</span>
          </span>
          <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+S</span>
        </button>
      )}
      {onOpenExportBundle && (
        <button
          type="button"
          style={{
            ...menuItemStyle,
            opacity: hasCsvData ? 1 : 0.45,
          }}
          disabled={!hasCsvData}
          onClick={() => {
            onCloseMenu();
            onOpenExportBundle();
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Package size={14} />
            <span>Export .metatext.zip...</span>
          </span>
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
            <span>{t('fileMenu.closeFile')}</span>
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
          <span>{t('fileMenu.undo')}</span>
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
          <span>{t('fileMenu.redo')}</span>
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
