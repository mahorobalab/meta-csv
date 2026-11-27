import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_LOCALES,
  normalizeLocaleTag,
  resolveLocale,
  translate,
} from '../i18n';
import { en, type MessageKey } from '../i18n/locales/en';

describe('i18n', () => {
  it('normalizes Chinese tags to VS Code lowercase zh-cn / zh-tw', () => {
    expect(normalizeLocaleTag('zh-CN')).toBe('zh-cn');
    expect(normalizeLocaleTag('zh_CN')).toBe('zh-cn');
    expect(normalizeLocaleTag('zh-Hans-CN')).toBe('zh-cn');
    expect(normalizeLocaleTag('zh-SG')).toBe('zh-cn');
    expect(normalizeLocaleTag('zh')).toBe('zh-cn');

    expect(normalizeLocaleTag('zh-TW')).toBe('zh-tw');
    expect(normalizeLocaleTag('zh_HK')).toBe('zh-tw');
    expect(normalizeLocaleTag('zh-MO')).toBe('zh-tw');
    expect(normalizeLocaleTag('zh-Hant-TW')).toBe('zh-tw');
  });

  it('normalizes other supported locales and falls back to en', () => {
    expect(normalizeLocaleTag('ja-JP')).toBe('ja');
    expect(normalizeLocaleTag('ko-KR')).toBe('ko');
    expect(normalizeLocaleTag('de-DE')).toBe('de');
    expect(normalizeLocaleTag('fr-CA')).toBe('fr');
    expect(normalizeLocaleTag('es-MX')).toBe('es');
    expect(normalizeLocaleTag('pt-BR')).toBe('en');
    expect(normalizeLocaleTag('')).toBe('en');
  });

  it('resolves explicit preference over system language', () => {
    expect(resolveLocale('ja', 'en-US')).toBe('ja');
    expect(resolveLocale('zh-cn', 'ja-JP')).toBe('zh-cn');
    expect(resolveLocale('auto', 'zh-tw')).toBe('zh-tw');
    expect(resolveLocale('auto', 'de-AT')).toBe('de');
  });

  it('interpolates parameters and provides non-empty strings for all locales', () => {
    expect(translate('en', 'status.rowsTotal', { total: '1,000', cols: 5 })).toBe(
      'Rows=1,000, Cols=5',
    );
    expect(translate('ja', 'status.rowsTotal', { total: '1,000', cols: 5 })).toBe(
      '行数=1,000, 列数=5',
    );
    const keys = Object.keys(en) as MessageKey[];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const val = translate(locale, key);
        expect(val.length, `Missing translation for ${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});
