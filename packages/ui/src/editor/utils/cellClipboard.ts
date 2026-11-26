import type { CellStyle } from '@metatext-editor/schema';
import {
  parsePlainTextToMatrix,
  type NativeClipboardBridge,
} from '../../columnClipboard';

export interface CopiedCellsPayload {
  /** Rows x Cols matrix of raw cell values */
  matrix: string[][];
  /** Rows x Cols matrix of per-cell styles */
  styles: Array<Array<CellStyle | undefined>>;
  plainText: string;
}

export interface ParsedPasteCellsResult {
  matrix: string[][];
  styles?: Array<Array<CellStyle | undefined>>;
  source: 'internal' | 'excel-html' | 'plain-text';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCellInlineCss(style?: CellStyle): string {
  if (!style) return '';
  const parts: string[] = [];
  if (style.bold) parts.push('font-weight:bold');
  if (style.italic) parts.push('font-style:italic');
  if (style.color) parts.push(`color:${style.color}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.align) parts.push(`text-align:${style.align}`);
  if (style.wrap) parts.push('white-space:normal');
  if (style.numberFormat) {
    parts.push(`mso-number-format:"${style.numberFormat.replace(/"/g, '\\"')}"`);
  }
  return parts.join(';');
}

export function formatMatrixAsTsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((v) =>
          v.includes('\t') || v.includes('\n') || v.includes('"')
            ? `"${v.replace(/"/g, '""')}"`
            : v,
        )
        .join('\t'),
    )
    .join('\r\n');
}

function parseExcelHtmlCells(html: string): ParsedPasteCellsResult | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trs = Array.from(doc.querySelectorAll('table tr'));
    if (trs.length === 0) return null;

    const matrix: string[][] = [];
    const styles: Array<Array<CellStyle | undefined>> = [];

    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      if (cells.length === 0) continue;
      const rowVals: string[] = [];
      const rowStyles: Array<CellStyle | undefined> = [];
      for (const el of cells) {
        rowVals.push((el.textContent ?? '').replace(/\r?\n$/, ''));
        const st = (el as HTMLElement).style;
        const parsed: CellStyle = {};
        if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) parsed.bold = true;
        if (st.fontStyle === 'italic') parsed.italic = true;
        if (st.color) parsed.color = st.color;
        if (
          st.backgroundColor &&
          st.backgroundColor !== 'transparent' &&
          st.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ) {
          parsed.backgroundColor = st.backgroundColor;
        }
        if (st.textAlign === 'left' || st.textAlign === 'center' || st.textAlign === 'right') {
          parsed.align = st.textAlign;
        }
        if (st.whiteSpace === 'normal' || st.whiteSpace === 'pre-wrap') {
          parsed.wrap = true;
        }
        rowStyles.push(Object.keys(parsed).length > 0 ? parsed : undefined);
      }
      matrix.push(rowVals);
      styles.push(rowStyles);
    }

    if (matrix.length === 0) return null;
    return { matrix, styles, source: 'excel-html' };
  } catch {
    return null;
  }
}

export async function writeCellsToClipboard(
  payload: Omit<CopiedCellsPayload, 'plainText'>,
  nativeClipboard?: NativeClipboardBridge,
): Promise<CopiedCellsPayload> {
  const plainText = formatMatrixAsTsv(payload.matrix);
  const fullPayload: CopiedCellsPayload = { ...payload, plainText };

  const totalCells = payload.matrix.reduce((acc, r) => acc + r.length, 0);
  const shouldBuildHtml = totalCells <= 25_000;
  const buildHtml = () => {
    const rowsHtml = payload.matrix
      .map((row, rIdx) => {
        const rowStyles = payload.styles[rIdx];
        const cellsHtml = row
          .map((v, cIdx) => {
            const css = buildCellInlineCss(rowStyles?.[cIdx]);
            const attr = css ? ` style="${escapeHtml(css)}"` : '';
            return `<td${attr}>${escapeHtml(v)}</td>`;
          })
          .join('');
        return `<tr>${cellsHtml}</tr>`;
      })
      .join('');
    return `<html><body><table>${rowsHtml}</table></body></html>`;
  };

  if (nativeClipboard) {
    try {
      if (shouldBuildHtml && nativeClipboard.writeHtml) {
        await nativeClipboard.writeHtml(buildHtml(), plainText);
      } else {
        await nativeClipboard.writeText(plainText);
      }
      return fullPayload;
    } catch {
      // Fall through to Web Clipboard API
    }
  }

  const canWriteHtml =
    shouldBuildHtml &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function';

  if (canWriteHtml) {
    try {
      const html = buildHtml();
      const item = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return fullPayload;
    } catch {
      // Fall back to plain text write
    }
  }

  if (typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(plainText);
  }
  return fullPayload;
}

export async function readClipboardForCellPaste(
  withStyle: boolean,
  inAppCopied: CopiedCellsPayload | null,
  nativeClipboard?: NativeClipboardBridge,
): Promise<ParsedPasteCellsResult | null> {
  let plainText = '';
  let htmlText = '';

  if (nativeClipboard) {
    try {
      plainText = await nativeClipboard.readText();
    } catch {
      plainText = '';
    }
  } else {
    if (withStyle && typeof navigator.clipboard?.read === 'function') {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html') && !htmlText) {
            htmlText = await (await item.getType('text/html')).text();
          }
          if (item.types.includes('text/plain') && !plainText) {
            plainText = await (await item.getType('text/plain')).text();
          }
        }
      } catch {
        // Fall back to readText
      }
    }

    if (!plainText && typeof navigator.clipboard?.readText === 'function') {
      try {
        plainText = await navigator.clipboard.readText();
      } catch {
        plainText = '';
      }
    }
  }

  if (inAppCopied) {
    const normClip = plainText.replace(/\r\n/g, '\n');
    const normInternal = inAppCopied.plainText.replace(/\r\n/g, '\n');
    if (!plainText || normClip === normInternal) {
      return {
        matrix: inAppCopied.matrix,
        styles: withStyle ? inAppCopied.styles : undefined,
        source: 'internal',
      };
    }
  }

  if (withStyle && htmlText) {
    const parsedHtml = parseExcelHtmlCells(htmlText);
    if (parsedHtml) return parsedHtml;
  }

  if (!plainText) return null;
  const matrix = parsePlainTextToMatrix(plainText);
  if (matrix.length === 0) return null;
  return {
    matrix,
    source: 'plain-text',
  };
}
