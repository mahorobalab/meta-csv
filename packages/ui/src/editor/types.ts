import type React from 'react';
import type { FileSystemAdapter, HistoryAdapter } from '@metatext-editor/core';
import type { MetaTextFormat } from '@metatext-editor/schema';
import type { EditorAppSettings, EditorHostMode } from '../SettingsAboutDialogs';
import type { ThemePreference } from '../theme';
import type { NativeClipboardBridge } from '../columnClipboard';
import type { NewFileFormat } from '../newFileTemplates';

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

export interface MetaTextEditorHandle {
  saveCsv: () => Promise<void>;
  serializeCurrentCsv: () => Uint8Array | null;
  undo: () => void;
  redo: () => void;
  reload: () => void;
  markClean: () => void;
  setZoomScale: (scale: number) => void;
  captureViewSnapshot: () => EditorViewSnapshot;
}

export interface EditorStatusInfo {
  fileName: string;
  dirty: boolean;
  totalRows: number;
  visibleRows: number;
  cols: number;
  markerCount: number;
  zoomScale?: number;
  fileBytes?: number;
  format?: MetaTextFormat;
  readOnly?: boolean;
  encoding?: string;
  lineEnding?: string;
}

export interface MetaTextEditorProps {
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
  onNewFile?: (format?: NewFileFormat) => void;
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
  /** Optional Shadow Git history adapter for persistent snapshots */
  historyAdapter?: HistoryAdapter;
  /** Optional controlled visibility for the right-side History panel (for exclusive toggle with host meta panel) */
  showHistoryPanel?: boolean;
  /** Optional controlled toggle handler for the right-side History panel */
  onToggleHistoryPanel?: () => void;
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

export interface CellRangeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellContextMenuState {
  range: CellRangeRect;
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
