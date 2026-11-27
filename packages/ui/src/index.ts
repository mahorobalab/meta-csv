export {
  MetaTextEditor,
  type EditorStatusInfo,
  type EditorViewSnapshot,
  type MetaTextEditorHandle,
  type MetaTextEditorProps,
} from './MetaTextEditor';
export type { NativeClipboardBridge } from './columnClipboard';
export {
  NEW_FILE_FORMAT_OPTIONS,
  createNewFileTemplate,
  type NewFileFormat,
  type NewFileFormatOption,
  type NewFileTemplate,
} from './newFileTemplates';
export {
  SettingsModal,
  AboutModal,
  type EditorAppSettings,
  type EditorHostMode,
  type FileLayoutSettingsProps,
  type SettingsModalProps,
  type AboutModalProps,
} from './SettingsAboutDialogs';
export {
  ConditionalRulesModal,
  BG_SWATCH_COLORS,
  TEXT_SWATCH_COLORS,
  type ConditionalRulesModalProps,
} from './ConditionalRulesModal';
export {
  MarkerControls,
  MARKER_COLORS,
  MARKER_PALETTE,
  type MarkerControlsProps,
} from './MarkerControls';
export {
  buildGridTheme,
  getSystemTheme,
  resolveThemeMode,
  useSystemTheme,
  type ThemePreference,
} from './theme';
export {
  I18nProvider,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  detectSystemLocale,
  getLocaleNativeName,
  isLanguagePreference,
  isSupportedLocale,
  normalizeLocaleTag,
  resolveLocale,
  translate,
  useI18n,
  type I18nContextValue,
  type I18nProviderProps,
  type LanguagePreference,
  type LocaleOption,
  type MessageKey,
  type Messages,
  type SupportedLocale,
  type TranslateFn,
} from './i18n';
