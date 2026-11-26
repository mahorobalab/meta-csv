import type { CellStyle, ColumnAlign } from '@meta-csv/schema';

export interface NativeClipboardBridge {
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
  writeHtml?: (html: string, altText: string) => Promise<void>;
}

export interface CopiedColumnMeta {
  title: string;
  style?: CellStyle;
  align?: ColumnAlign;
  wrap?: boolean;
  numberFormat?: string;
}

export interface CopiedColumnPayload {
  columns: CopiedColumnMeta[];
  /** Rows x Cols matrix of data values (excluding header) */
  matrix: string[][];
  plainText: string;
}

export interface ParsedPasteColumnResult {
  /** 2D matrix of rows x cols */
  matrix: string[][];
  /** Per-column metadata (style / title) when available */
  columns?: CopiedColumnMeta[];
  source: 'internal' | 'excel-html' | 'plain-text';
}

export interface CopiedRowsPayload {
  /** Rows x Cols matrix of row data values */
  matrix: string[][];
  /** Per-row style (index aligned with matrix rows) */
  rowStyles: Array<CellStyle | undefined>;
  plainText: string;
}

export interface ParsedPasteRowsResult {
  matrix: string[][];
  rowStyles?: Array<CellStyle | undefined>;
  source: 'internal' | 'excel-html' | 'plain-text';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInlineCss(col: {
  style?: CellStyle;
  align?: ColumnAlign;
  wrap?: boolean;
  numberFormat?: string;
}): string {
  const parts: string[] = [];
  if (col.style?.bold) parts.push('font-weight:bold');
  if (col.style?.italic) parts.push('font-style:italic');
  if (col.style?.color) parts.push(`color:${col.style.color}`);
  if (col.style?.backgroundColor) {
    parts.push(`background-color:${col.style.backgroundColor}`);
  }
  const align = col.align ?? col.style?.align;
  if (align) parts.push(`text-align:${align}`);
  if (col.wrap ?? col.style?.wrap) parts.push('white-space:normal');
  const numFmt = col.numberFormat ?? col.style?.numberFormat;
  if (numFmt) {
    parts.push(`mso-number-format:"${numFmt.replace(/"/g, '\\"')}"`);
  }
  return parts.join(';');
}

export async function writeColumnsToClipboard(
  payload: Omit<CopiedColumnPayload, 'plainText'>,
  nativeClipboard?: NativeClipboardBridge,
): Promise<CopiedColumnPayload> {
  // Copy data rows only (tab-separated across columns, CRLF across rows)
  const plainText = payload.matrix.map((row) => row.join('\t')).join('\r\n');
  const fullPayload: CopiedColumnPayload = { ...payload, plainText };

  const shouldBuildHtml = payload.matrix.length * Math.max(1, payload.columns.length) <= 25_000;
  const buildHtml = () => {
    const colStyleAttrs = payload.columns.map((c) => {
      const css = buildInlineCss(c);
      return css ? ` style="${escapeHtml(css)}"` : '';
    });
    const rowsHtml = payload.matrix
      .map(
        (row) =>
          `<tr>${row
            .map((v, cIdx) => `<td${colStyleAttrs[cIdx] ?? ''}>${escapeHtml(v)}</td>`)
            .join('')}</tr>`,
      )
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

/** Parse plain text (TSV, CSV, or newline-delimited values) into a 2D string matrix */
export function parsePlainTextToMatrix(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }
  if (rawLines.length === 0) return [];

  const hasTab = rawLines.some((l) => l.includes('\t'));
  if (hasTab) {
    return rawLines.map((l) => l.split('\t'));
  }

  const commaCounts = rawLines.slice(0, 20).map((l) => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) count++;
    }
    return count;
  });
  const firstCommas = commaCounts[0] ?? 0;
  const isLikelyCsv =
    firstCommas > 0 &&
    (rawLines.length === 1 || commaCounts.every((c) => c === firstCommas));

  if (isLikelyCsv) {
    return rawLines.map((line) => {
      const cols: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cols.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur);
      return cols;
    });
  }

  return rawLines.map((l) => [l]);
}

function parseExcelHtmlTable(html: string): ParsedPasteColumnResult | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trs = Array.from(doc.querySelectorAll('table tr'));
    if (trs.length === 0) return null;

    const matrix: string[][] = [];
    const columns: CopiedColumnMeta[] = [];

    for (let rIdx = 0; rIdx < trs.length; rIdx++) {
      const cells = Array.from(trs[rIdx]!.querySelectorAll('th, td'));
      if (cells.length === 0) continue;
      matrix.push(cells.map((c) => (c.textContent ?? '').replace(/\r?\n$/, '')));

      if (rIdx === 0) {
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const sampleCell = cells[cIdx] as HTMLElement | undefined;
          const meta: CopiedColumnMeta = { title: '' };
          if (sampleCell) {
            const st = sampleCell.style;
            const rawAttr = sampleCell.getAttribute('style') ?? '';
            const extracted: CellStyle = {};
            if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) {
              extracted.bold = true;
            }
            if (st.fontStyle === 'italic') {
              extracted.italic = true;
            }
            if (st.color) {
              extracted.color = st.color;
            }
            if (
              st.backgroundColor &&
              st.backgroundColor !== 'transparent' &&
              st.backgroundColor !== 'rgba(0, 0, 0, 0)'
            ) {
              extracted.backgroundColor = st.backgroundColor;
            }
            if (st.textAlign === 'left' || st.textAlign === 'center' || st.textAlign === 'right') {
              meta.align = st.textAlign;
            }
            if (st.whiteSpace === 'normal' || st.whiteSpace === 'pre-wrap') {
              meta.wrap = true;
            }
            const msoMatch = /mso-number-format\s*:\s*['"]?([^;'"]+)['"]?/i.exec(rawAttr);
            if (msoMatch && msoMatch[1] && msoMatch[1].toLowerCase() !== 'general') {
              meta.numberFormat = msoMatch[1].replace(/\\"/g, '"');
            }
            if (Object.keys(extracted).length > 0) {
              meta.style = extracted;
            }
          }
          columns.push(meta);
        }
      }
    }

    if (matrix.length === 0) return null;
    return {
      matrix,
      columns,
      source: 'excel-html',
    };
  } catch {
    return null;
  }
}

export async function readClipboardForColumnPaste(
  withStyle: boolean,
  inAppCopied: CopiedColumnPayload | null,
  nativeClipboard?: NativeClipboardBridge,
): Promise<ParsedPasteColumnResult | null> {
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

  // If clipboard matches our own last column copy (or clipboard read was blocked), use exact in-app payload
  if (inAppCopied) {
    const normClip = plainText.replace(/\r\n/g, '\n');
    const normInternal = inAppCopied.plainText.replace(/\r\n/g, '\n');
    if (!plainText || normClip === normInternal) {
      return {
        matrix: inAppCopied.matrix,
        columns: withStyle
          ? inAppCopied.columns
          : inAppCopied.columns.map((c) => ({ title: c.title })),
        source: 'internal',
      };
    }
  }

  if (withStyle && htmlText) {
    const parsedHtml = parseExcelHtmlTable(htmlText);
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

/**
 * Parse plain text for row paste: supports TSV, CSV, and space-delimited lines.
 */
export function parsePlainTextForRowPaste(text: string): string[][] {
  const base = parsePlainTextToMatrix(text);
  if (base.length === 0) return [];
  // If already split into multiple columns (TSV or CSV), keep as-is
  if (base.some((r) => r.length > 1)) return base;

  // Otherwise try whitespace-delimited splitting (e.g. copied from terminal / space-separated logs)
  const rawLines = base.map((r) => r[0] ?? '');
  const splitBySpaces = rawLines.map((line) => {
    const trimmed = line.trim();
    return trimmed.length === 0 ? [''] : trimmed.split(/\s+/);
  });
  const firstCount = splitBySpaces[0]?.length ?? 1;
  const looksSpaceDelimited =
    firstCount > 1 &&
    (splitBySpaces.length === 1 ||
      splitBySpaces.slice(0, 20).every((cols) => cols.length >= 2));
  return looksSpaceDelimited ? splitBySpaces : base;
}

function parseExcelHtmlRows(html: string): ParsedPasteRowsResult | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trs = Array.from(doc.querySelectorAll('table tr'));
    if (trs.length === 0) return null;

    const matrix: string[][] = [];
    const rowStyles: Array<CellStyle | undefined> = [];

    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      if (cells.length === 0) continue;
      matrix.push(cells.map((c) => (c.textContent ?? '').replace(/\r?\n$/, '')));

      const sampleCell = cells[0] as HTMLElement | undefined;
      let extracted: CellStyle | undefined;
      if (sampleCell) {
        const st = sampleCell.style;
        const style: CellStyle = {};
        if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) style.bold = true;
        if (st.fontStyle === 'italic') style.italic = true;
        if (st.color) style.color = st.color;
        if (
          st.backgroundColor &&
          st.backgroundColor !== 'transparent' &&
          st.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ) {
          style.backgroundColor = st.backgroundColor;
        }
        if (st.textAlign === 'left' || st.textAlign === 'center' || st.textAlign === 'right') {
          style.align = st.textAlign;
        }
        if (st.whiteSpace === 'normal' || st.whiteSpace === 'pre-wrap') {
          style.wrap = true;
        }
        if (Object.keys(style).length > 0) extracted = style;
      }
      rowStyles.push(extracted);
    }

    if (matrix.length === 0) return null;
    return { matrix, rowStyles, source: 'excel-html' };
  } catch {
    return null;
  }
}

export async function writeRowsToClipboard(
  payload: Omit<CopiedRowsPayload, 'plainText'>,
  nativeClipboard?: NativeClipboardBridge,
): Promise<CopiedRowsPayload> {
  const plainText = payload.matrix.map((row) => row.join('\t')).join('\r\n');
  const fullPayload: CopiedRowsPayload = { ...payload, plainText };

  const totalCells = payload.matrix.reduce((acc, r) => acc + r.length, 0);
  const shouldBuildHtml = totalCells <= 25_000;
  const buildHtml = () => {
    const rowsHtml = payload.matrix
      .map((row, rIdx) => {
        const css = buildInlineCss({ style: payload.rowStyles[rIdx] });
        const styleAttr = css ? ` style="${escapeHtml(css)}"` : '';
        return `<tr>${row.map((v) => `<td${styleAttr}>${escapeHtml(v)}</td>`).join('')}</tr>`;
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

export async function readClipboardForRowPaste(
  withStyle: boolean,
  inAppCopied: CopiedRowsPayload | null,
  nativeClipboard?: NativeClipboardBridge,
): Promise<ParsedPasteRowsResult | null> {
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
        rowStyles: withStyle ? inAppCopied.rowStyles : undefined,
        source: 'internal',
      };
    }
  }

  if (withStyle && htmlText) {
    const parsedHtml = parseExcelHtmlRows(htmlText);
    if (parsedHtml) return parsedHtml;
  }

  if (!plainText) return null;
  const matrix = parsePlainTextForRowPaste(plainText);
  if (matrix.length === 0) return null;
  return {
    matrix,
    source: 'plain-text',
  };
}
