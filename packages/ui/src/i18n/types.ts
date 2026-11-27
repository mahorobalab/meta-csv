export type SupportedLocale =
  | 'en'
  | 'ja'
  | 'zh-cn'
  | 'zh-tw'
  | 'ko'
  | 'de'
  | 'fr'
  | 'es';

export type LanguagePreference = 'auto' | SupportedLocale;

export interface LocaleOption {
  code: SupportedLocale;
  nativeName: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'zh-cn', nativeName: '简体中文' },
  { code: 'zh-tw', nativeName: '繁體中文' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'es', nativeName: 'Español' },
] as const;

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = LOCALE_OPTIONS.map((o) => o.code);
