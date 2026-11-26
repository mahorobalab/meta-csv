import { useEffect, useState } from 'react';
import type { Theme } from '@glideapps/glide-data-grid';
import { DEFAULT_FONT_SIZE, type TableConfig } from '@meta-csv/schema';

export type ThemePreference = 'system' | 'light' | 'dark';

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useSystemTheme(): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return systemTheme;
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemTheme: 'light' | 'dark',
): 'light' | 'dark' {
  return preference === 'system' ? systemTheme : preference;
}

function readCssVar(name: string): string | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  const val = getComputedStyle(document.body).getPropertyValue(name).trim();
  return val.length > 0 ? val : undefined;
}

export function buildGridTheme(
  mode: 'light' | 'dark',
  table?: TableConfig,
): Partial<Theme> {
  const fontFamily =
    table?.fontFamily ??
    readCssVar('--vscode-font-family') ??
    "'Segoe UI', 'Yu Gothic UI', 'Meiryo', sans-serif";
  const fontSize = table?.fontSize ?? DEFAULT_FONT_SIZE;

  const vsBg = readCssVar('--vscode-editor-background');
  const vsFg = readCssVar('--vscode-editor-foreground');
  const vsBorder =
    readCssVar('--vscode-editorGroup-border') ?? readCssVar('--vscode-panel-border');
  const vsHeaderBg =
    readCssVar('--vscode-editorGroupHeader-tabsBackground') ??
    readCssVar('--vscode-sideBar-background');
  const vsAccent = readCssVar('--vscode-focusBorder');

  if (mode === 'dark') {
    return {
      accentColor: vsAccent ?? '#3b82f6',
      accentLight: 'rgba(59, 130, 246, 0.22)',
      textDark: vsFg ?? '#e2e8f0',
      textMedium: '#94a3b8',
      textLight: '#64748b',
      textHeader: vsFg ?? '#f1f5f9',
      bgCell: vsBg ?? '#1e1e1e',
      bgCellMedium: '#252526',
      bgHeader: vsHeaderBg ?? '#2d2d2d',
      bgHeaderHasFocus: '#383838',
      bgHeaderHovered: '#333333',
      borderColor: vsBorder ?? 'rgba(255, 255, 255, 0.11)',
      horizontalBorderColor: vsBorder ?? 'rgba(255, 255, 255, 0.10)',
      fontFamily,
      baseFontStyle: `${fontSize}px`,
      headerFontStyle: `600 ${fontSize}px`,
    };
  }

  return {
    accentColor: vsAccent ?? '#2563eb',
    accentLight: 'rgba(37, 99, 235, 0.14)',
    textDark: vsFg ?? '#0f172a',
    textMedium: '#475569',
    textLight: '#94a3b8',
    textHeader: vsFg ?? '#1e293b',
    bgCell: vsBg ?? '#ffffff',
    bgCellMedium: '#f8fafc',
    bgHeader: vsHeaderBg ?? '#f1f5f9',
    bgHeaderHasFocus: '#e2e8f0',
    bgHeaderHovered: '#e8eef5',
    borderColor: vsBorder ?? 'rgba(15, 23, 42, 0.14)',
    horizontalBorderColor: vsBorder ?? 'rgba(15, 23, 42, 0.14)',
    fontFamily,
    baseFontStyle: `${fontSize}px`,
    headerFontStyle: `600 ${fontSize}px`,
  };
}
