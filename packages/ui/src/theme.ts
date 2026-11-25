import type { Theme } from '@glideapps/glide-data-grid';
import { DEFAULT_FONT_SIZE, type TableConfig } from '@meta-csv/schema';

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
      borderColor: vsBorder ?? '#3c3c3c',
      horizontalBorderColor: vsBorder ?? '#333333',
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
    borderColor: vsBorder ?? '#e2e8f0',
    horizontalBorderColor: vsBorder ?? '#e2e8f0',
    fontFamily,
    baseFontStyle: `${fontSize}px`,
    headerFontStyle: `600 ${fontSize}px`,
  };
}
