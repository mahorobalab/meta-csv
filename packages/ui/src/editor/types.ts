import type React from 'react';
import type { FileSystemAdapter } from '@meta-csv/core';
import type { MetaTextFormat } from '@meta-csv/schema';
import type { EditorAppSettings, EditorHostMode } from '../SettingsAboutDialogs';
import type { ThemePreference } from '../theme';
import type { NativeClipboardBridge } from '../columnClipboard';

export interface EditorViewSnapshot {
  scrollCol: number;
  scrollRow: number;
  selectedCell?: [number, number];
  zoomScale: number;
  filterQuery: string;
  filterContextRows: number;
  collapseColKey: string;
  onlyMarked: boolean;
  searchQuery: string;
  showCellInspector: boolean;
}

export interface MetaCsvEditorHandle {
  saveCsv: () => Promise<void>;
  serializeCurrentCsv: () => Uint8Array | null;
  undo: () => void;
  redo: () => void;
  reload: () => void;
  markClean: () => void;
  captureViewSnapshot: () => EditorViewSnapshot;
}

export interface EditorStatusInfo {
  fileName: string;
  dirty: boolean;
  totalRows: number;
  visibleRows: number;
  cols: number;
  markerCount: number;
  fileBytes?: number;
  format?: MetaTextFormat;
  readOnly?: boolean;
  encoding?: string;
  lineEnding?: string;
}

export interface MetaCsvEditorProps {
  adapter: FileSystemAdapter;
  hostMode?: EditorHostMode;
  isActive?: boolean;
  initialViewSnapshot?: EditorViewSnapshot;
  filePath?: string;
  themeMode?: 'light' | 'dark';
  themePreference?: ThemePreference;
  systemTheme?: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings?: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  onOpenSettings?: () => void;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveAs?: (bytes: Uint8Array, metaText: string) => Promise<boolean | void> | boolean | void;
  onSaveAsStream?: (
    chunks: Iterable<Uint8Array>,
    metaText: string,
  ) => Promise<boolean | void> | boolean | void;
  onCloseFile?: () => void;
  fileMenuItems?: React.ReactNode;
  settingsExtraSection?: React.ReactNode;
  onDocumentEdit?: (label: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (info: EditorStatusInfo) => void;
  /** Optional external JSONC text override (for live playground editing) */
  externalMetaText?: string | null;
  onMetaTextChange?: (text: string) => void;
  /** Optional native clipboard bridge (Desktop Tauri uses OS clipboard without browser permission prompts) */
  nativeClipboard?: NativeClipboardBridge;
}

export interface HeaderContextMenuState {
  visCols: number[];
  actualCols: number[];
  colKeys: string[];
  x: number;
  y: number;
  headerBounds: { x: number; y: number; width: number; height: number };
}

export interface RowContextMenuState {
  viewRows: number[];
  dataRows: number[];
  x: number;
  y: number;
}

export interface EditingHeaderColState {
  actualCol: number;
  colKey: string;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PendingDeleteRowsState {
  dataRows: number[];
  label: string;
}

export interface PendingDeleteColState {
  actualCols: number[];
  colKeys: string[];
  label: string;
}

export interface PendingHideColState {
  colKeys: string[];
  label: string;
  dontShowAgain: boolean;
}
