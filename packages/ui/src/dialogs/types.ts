import type React from 'react';
import type {
  JsonlArrayMode,
  LogParserConfig,
  MarkerColor,
  MetaTextFormat,
} from '@meta-csv/schema';
import type { ThemePreference } from '../theme';

export type EditorHostMode = 'vscode' | 'desktop' | 'web';

export interface EditorAppSettings {
  defaultFontSize?: number;
  defaultRowHeight?: number;
  defaultMarkerColor?: MarkerColor;
  showRowNumbers?: boolean;
  noHeaderColumnStyle?: 'excel' | 'numbered';
  zebraStriping?: boolean;
  confirmHideColumn?: boolean;
  reopenLastFiles?: boolean;
}

export interface FileLayoutSettingsProps {
  format?: MetaTextFormat;
  readOnly: boolean;
  onReadOnlyChange: (next: boolean) => void;
  hasHeader: boolean;
  onHasHeaderChange: (next: boolean) => void;
  jsonlFlattenDepth?: number;
  onJsonlFlattenDepthChange?: (next: number) => void;
  jsonlArrayMode?: JsonlArrayMode;
  onJsonlArrayModeChange?: (next: JsonlArrayMode) => void;
  logLinePattern?: string;
  logColumnNames?: string[];
  logMultilinePattern?: string;
  logWordWrap?: boolean;
  logMatchedPresetId?: string;
  logRegexError?: string;
  logSampleLines?: string[];
  onLogConfigChange?: (patch: Partial<LogParserConfig>) => void;
  freezeColumns: number;
  maxFreezeColumns: number;
  onFreezeColumnsChange: (next: number) => void;
  fontSize: number;
  onFontSizeChange: (next: number) => void;
  defaultRowHeight: number;
  onDefaultRowHeightChange: (next: number) => void;
  columns: Array<{ key: string; label: string; visible: boolean; wrap?: boolean }>;
  onToggleColumnVisible: (key: string, visible: boolean) => void;
  onToggleColumnWrap?: (key: string, wrap: boolean) => void;
}

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  hostMode?: EditorHostMode;
  themeMode: 'light' | 'dark';
  themePreference?: ThemePreference;
  systemTheme?: 'light' | 'dark';
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  appSettings: EditorAppSettings;
  onAppSettingsChange?: (patch: Partial<EditorAppSettings>) => void;
  fileSettings?: FileLayoutSettingsProps;
  onOpenHostSettings?: () => void;
  extraSection?: React.ReactNode;
}

export interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  themeMode: 'light' | 'dark';
  hostMode: EditorHostMode;
}
