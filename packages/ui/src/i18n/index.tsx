import React, { createContext, useContext, useMemo } from 'react';
import {
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  type LanguagePreference,
  type LocaleOption,
  type SupportedLocale,
} from './types';
import { en, type MessageKey, type Messages } from './locales/en';
import { ja } from './locales/ja';
import { zhCn } from './locales/zh-cn';
import { zhTw } from './locales/zh-tw';
import { ko } from './locales/ko';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';

export { LOCALE_OPTIONS, SUPPORTED_LOCALES };
export type { LanguagePreference, LocaleOption, SupportedLocale, MessageKey, Messages };

const DICTIONARIES: Record<SupportedLocale, Messages> = {
  en,
  ja,
  'zh-cn': zhCn,
  'zh-tw': zhTw,
  ko,
  de,
  fr,
  es,
};

/**
 * Normalize an arbitrary BCP-47 / VS Code language tag to one of our supported locales.
 * Notably maps zh-TW / zh-HK / zh-MO / zh-Hant -> 'zh-tw' and other zh* -> 'zh-cn'
 * (matching VS Code's lowercase 'zh-cn' / 'zh-tw' convention).
 */
export function normalizeLocaleTag(tag?: string | null): SupportedLocale {
  if (!tag) return 'en';
  const norm = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!norm) return 'en';

  if (norm === 'zh-tw' || norm === 'zh-hk' || norm === 'zh-mo' || norm.startsWith('zh-hant')) {
    return 'zh-tw';
  }
  if (norm === 'zh' || norm === 'zh-cn' || norm === 'zh-sg' || norm.startsWith('zh-hans') || norm.startsWith('zh-')) {
    return 'zh-cn';
  }
  if (norm === 'ja' || norm.startsWith('ja-')) return 'ja';
  if (norm === 'ko' || norm.startsWith('ko-')) return 'ko';
  if (norm === 'de' || norm.startsWith('de-')) return 'de';
  if (norm === 'fr' || norm.startsWith('fr-')) return 'fr';
  if (norm === 'es' || norm.startsWith('es-')) return 'es';
  return 'en';
}

export function detectSystemLocale(overrideLanguage?: string): SupportedLocale {
  if (overrideLanguage) {
    return normalizeLocaleTag(overrideLanguage);
  }
  if (typeof navigator !== 'undefined') {
    const candidates =
      Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
    for (const lang of candidates) {
      if (!lang) continue;
      const resolved = normalizeLocaleTag(lang);
      // Accept explicit match or English
      if (resolved !== 'en' || lang.toLowerCase().startsWith('en')) {
        return resolved;
      }
    }
  }
  return 'en';
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || isSupportedLocale(value);
}

export function resolveLocale(
  preference?: LanguagePreference,
  systemLanguage?: string,
): SupportedLocale {
  if (preference && preference !== 'auto' && isSupportedLocale(preference)) {
    return preference;
  }
  return detectSystemLocale(systemLanguage);
}

export function getLocaleNativeName(locale: SupportedLocale): string {
  return LOCALE_OPTIONS.find((o) => o.code === locale)?.nativeName ?? 'English';
}

export function translate(
  locale: SupportedLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export type TranslateFn = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface I18nContextValue {
  locale: SupportedLocale;
  systemLocale: SupportedLocale;
  t: TranslateFn;
}

const defaultLocale = detectSystemLocale();

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  systemLocale: defaultLocale,
  t: (key, params) => translate(defaultLocale, key, params),
});

export interface I18nProviderProps {
  preference?: LanguagePreference;
  systemLanguage?: string;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  preference = 'auto',
  systemLanguage,
  children,
}) => {
  const value = useMemo<I18nContextValue>(() => {
    const systemLocale = detectSystemLocale(systemLanguage);
    const locale = resolveLocale(preference, systemLanguage);
    return {
      locale,
      systemLocale,
      t: (key, params) => translate(locale, key, params),
    };
  }, [preference, systemLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
