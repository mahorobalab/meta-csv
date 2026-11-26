import Papa from 'papaparse';
import type {
  CsvDelimiter,
  CsvDialectConfig,
  CsvEncoding,
  CsvLineEnding,
  JsonlArrayMode,
  MetaTextFormat,
} from '@meta-csv/schema';

export interface ResolvedJsonlOptions {
  flattenDepth: number;
  arrayMode: JsonlArrayMode;
  encoding: CsvEncoding;
  lineEnding: CsvLineEnding;
}

export interface ResolvedLogOptions {
  linePattern?: string;
  columnNames: string[];
  timestampColumn?: string;
  levelColumn?: string;
  multilinePattern?: string;
  wordWrap: boolean;
  encoding: CsvEncoding;
  lineEnding: CsvLineEnding;
  matchedPresetId?: string;
  regexError?: string;
}

export interface ResolvedCsvDialect {
  hasHeader: boolean;
  delimiter: CsvDelimiter;
  encoding: CsvEncoding;
  lineEnding: CsvLineEnding;
}

export interface ParsedCsvData {
  headers: string[];
  rows: string[][];
  columnKeys: string[];
  dialect: ResolvedCsvDialect;
  format?: MetaTextFormat;
  jsonlOptions?: ResolvedJsonlOptions;
  logOptions?: ResolvedLogOptions;
  invalidLineCount?: number;
  sampleLines?: string[];
}

/** Convert 0-based column index to Excel-style column label (0 -> A, 25 -> Z, 26 -> AA). */
export function indexToExcelColumn(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function detectEncoding(bytes: Uint8Array): CsvEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8-bom';
  }
  try {
    const sampleLimit = 65536;
    const isTruncated = bytes.length > sampleLimit;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(
      isTruncated ? bytes.subarray(0, sampleLimit) : bytes,
      { stream: isTruncated },
    );
    return 'utf-8';
  } catch {
    return 'shift-jis';
  }
}

export function decodeCsvBytes(bytes: Uint8Array, encoding?: CsvEncoding): {
  text: string;
  encoding: CsvEncoding;
} {
  const resolved = encoding ?? detectEncoding(bytes);
  if (resolved === 'utf-8-bom') {
    const slice =
      bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        ? bytes.subarray(3)
        : bytes;
    return { text: new TextDecoder('utf-8').decode(slice), encoding: 'utf-8-bom' };
  }
  if (resolved === 'shift-jis') {
    return { text: new TextDecoder('shift-jis').decode(bytes), encoding: 'shift-jis' };
  }
  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
}

export function encodeCsvText(text: string, encoding: CsvEncoding): Uint8Array {
  const encoder = new TextEncoder();
  const body = encoder.encode(text);
  if (encoding === 'utf-8-bom') {
    const out = new Uint8Array(3 + body.length);
    out[0] = 0xef;
    out[1] = 0xbb;
    out[2] = 0xbf;
    out.set(body, 3);
    return out;
  }
  return body;
}

export function detectLineEnding(text: string): CsvLineEnding {
  const crlf = text.indexOf('\r\n');
  if (crlf !== -1) return 'crlf';
  return 'lf';
}

export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 4096).split(/\r?\n/).slice(0, 5).join('\n');
  const candidates: CsvDelimiter[] = [',', '\t', ';', '|'];
  let best: CsvDelimiter = ',';
  let bestCount = -1;
  for (const delim of candidates) {
    const count = sample.split(delim).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return bestCount > 0 ? best : ',';
}

export interface ParseProgress {
  phase: 'decoding' | 'parsing' | 'finalizing';
  percent: number;
  rowsParsed: number;
}

export function parseCsvBytes(
  bytes: Uint8Array,
  override?: CsvDialectConfig,
  onProgress?: (progress: ParseProgress) => void,
): ParsedCsvData {
  onProgress?.({ phase: 'decoding', percent: 5, rowsParsed: 0 });
  const { text, encoding } = decodeCsvBytes(bytes, override?.encoding);
  const lineEnding = override?.lineEnding ?? detectLineEnding(text);
  const delimiter = override?.delimiter ?? detectDelimiter(text);
  const hasHeader = override?.hasHeader ?? true;

  onProgress?.({ phase: 'parsing', percent: 20, rowsParsed: 0 });

  const totalLen = Math.max(1, text.length);
  const rawRows: string[][] = [];
  let colCount = 0;
  let lastNotify = 0;

  if (onProgress && totalLen > 2_000_000) {
    // Streaming row step for large files so progress can be reported safely (including quoted multiline cells)
    let rowCounter = 0;
    Papa.parse<string[]>(text, {
      delimiter,
      skipEmptyLines: 'greedy',
      step: (results) => {
        const r = results.data;
        if (r.length > colCount) colCount = r.length;
        rawRows.push(r);
        rowCounter++;
        if ((rowCounter & 0x3fff) === 0) {
          const now = performance.now();
          if (now - lastNotify >= 80) {
            lastNotify = now;
            const cursor = results.meta.cursor ?? 0;
            const pct = Math.min(92, 20 + Math.round((cursor / totalLen) * 72));
            onProgress({ phase: 'parsing', percent: pct, rowsParsed: rawRows.length });
          }
        }
      },
    });
  } else {
    const parsed = Papa.parse<string[]>(text, {
      delimiter,
      skipEmptyLines: 'greedy',
    });
    for (let i = 0; i < parsed.data.length; i++) {
      const r = parsed.data[i]!;
      if (r.length > colCount) colCount = r.length;
      rawRows.push(r);
    }
  }

  onProgress?.({ phase: 'finalizing', percent: 95, rowsParsed: rawRows.length });

  let headers: string[];
  let rows: string[][];
  let columnKeys: string[];

  if (hasHeader && rawRows.length > 0) {
    const firstRow = rawRows[0] ?? [];
    headers = Array.from({ length: colCount }, (_, i) => firstRow[i] ?? `column ${i + 1}`);
    rows = rawRows.slice(1);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.length !== colCount) {
        rows[i] = normalizeRowLength(rows[i]!, colCount);
      }
    }
    columnKeys = headers.map((h, i) => (h.trim().length > 0 ? h : String(i)));
  } else {
    headers = Array.from({ length: colCount }, (_, i) => `column ${i + 1}`);
    rows = rawRows;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.length !== colCount) {
        rows[i] = normalizeRowLength(rows[i]!, colCount);
      }
    }
    columnKeys = Array.from({ length: colCount }, (_, i) => String(i));
  }

  onProgress?.({ phase: 'finalizing', percent: 100, rowsParsed: rows.length });

  return {
    headers,
    rows,
    columnKeys,
    dialect: { hasHeader, delimiter, encoding, lineEnding },
  };
}

function normalizeRowLength(row: string[], colCount: number): string[] {
  if (row.length === colCount) return row;
  const next = row.slice(0, colCount);
  while (next.length < colCount) next.push('');
  return next;
}

export function serializeCsv(
  headers: string[],
  rows: string[][],
  dialect: ResolvedCsvDialect,
): Uint8Array {
  const data = dialect.hasHeader ? [headers, ...rows] : rows;
  const newline = dialect.lineEnding === 'crlf' ? '\r\n' : '\n';
  const text = Papa.unparse(data, {
    delimiter: dialect.delimiter,
    newline,
  });
  return encodeCsvText(text, dialect.encoding);
}

function serializeCsvRow(row: string[], delimiter: string): string {
  const len = row.length;
  if (len === 0) return '';
  const parts = new Array<string>(len);
  for (let c = 0; c < len; c++) {
    const raw = row[c] ?? '';
    if (
      raw.indexOf(delimiter) !== -1 ||
      raw.indexOf('"') !== -1 ||
      raw.indexOf('\n') !== -1 ||
      raw.indexOf('\r') !== -1
    ) {
      parts[c] = `"${raw.replace(/"/g, '""')}"`;
    } else {
      parts[c] = raw;
    }
  }
  return parts.join(delimiter);
}

/**
 * Lazily serialize CSV rows into bounded UTF-8 byte chunks without allocating
 * a monolithic string or Uint8Array for the entire file.
 * Produces byte-identical output to `serializeCsv`.
 */
export function* iterateSerializedCsvChunks(
  headers: string[],
  rows: string[][],
  dialect: ResolvedCsvDialect,
  chunkRows = 20_000,
): Generator<Uint8Array> {
  const safeChunkRows = Math.max(1, Math.floor(chunkRows));
  const delimiter = dialect.delimiter;
  const newline = dialect.lineEnding === 'crlf' ? '\r\n' : '\n';
  const encoder = new TextEncoder();

  let isFirstChunk = true;
  let lines: string[] = [];

  const encodeChunk = (text: string): Uint8Array => {
    if (isFirstChunk) {
      isFirstChunk = false;
      return encodeCsvText(text, dialect.encoding);
    }
    return encoder.encode(text);
  };

  const flush = (): Uint8Array => {
    const prefix = isFirstChunk ? '' : newline;
    const text = prefix + lines.join(newline);
    lines = [];
    return encodeChunk(text);
  };

  if (dialect.hasHeader) {
    lines.push(serializeCsvRow(headers, delimiter));
    if (lines.length >= safeChunkRows) {
      yield flush();
    }
  }

  for (let r = 0; r < rows.length; r++) {
    lines.push(serializeCsvRow(rows[r]!, delimiter));
    if (lines.length >= safeChunkRows) {
      yield flush();
    }
  }

  if (lines.length > 0) {
    yield flush();
  } else if (isFirstChunk) {
    // Empty file (no header, no rows): still emit BOM if utf-8-bom
    yield encodeChunk('');
  }
}

/**
 * Estimate comfortable initial column widths from the first N rows (Zero-Config auto-fit).
 */
export function estimateColumnWidths(
  headers: string[],
  rows: string[][],
  sampleLimit = 200,
): number[] {
  const sampleCount = Math.min(rows.length, sampleLimit);
  return headers.map((header, colIdx) => {
    let maxUnits = measureVisualUnits(header);
    for (let r = 0; r < sampleCount; r++) {
      const val = rows[r]?.[colIdx] ?? '';
      const units = measureVisualUnits(val);
      if (units > maxUnits) maxUnits = units;
    }
    const px = Math.round(maxUnits * 7.8 + 28);
    return Math.max(72, Math.min(440, px));
  });
}

function measureVisualUnits(text: string): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Rough CJK/full-width heuristic
    units += code > 0xff ? 1.85 : 1;
  }
  return units;
}

/**
 * Estimate wrapped line count for a cell value given column width and font size in pixels.
 */
export function estimateWrappedLineCount(
  text: string,
  colWidthPx: number,
  fontSizePx: number,
): number {
  if (!text) return 1;
  const avail = Math.max(24, colWidthPx - 16);
  const hasNewline = text.indexOf('\n') !== -1;
  if (!hasNewline && text.length * fontSizePx * 0.62 <= avail) {
    return 1;
  }

  let totalLines = 0;
  let lineWidth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 13) continue; // ignore \r
    if (ch === 10) {
      totalLines += Math.max(1, Math.ceil(lineWidth / avail));
      lineWidth = 0;
      continue;
    }
    lineWidth += ch > 0xff ? fontSizePx * 1.02 : fontSizePx * 0.58;
  }
  totalLines += Math.max(1, Math.ceil(lineWidth / avail));
  return Math.max(1, totalLines);
}

/**
 * Estimate dynamic row height (px) for rows containing wrapped columns or explicit newlines.
 */
export function estimateAutoRowHeight(
  row: string[],
  wrappedCols: Array<{ colIdx: number; widthPx: number }>,
  multilineColIndices: number[],
  options: { defaultHeight: number; fontSize: number; maxHeight?: number },
): number {
  const maxHeight = options.maxHeight ?? 240;
  let maxLines = 1;

  for (let i = 0; i < wrappedCols.length; i++) {
    const spec = wrappedCols[i]!;
    const val = row[spec.colIdx] ?? '';
    if (val.length > 0) {
      const lines = estimateWrappedLineCount(val, spec.widthPx, options.fontSize);
      if (lines > maxLines) maxLines = lines;
    }
  }

  for (let i = 0; i < multilineColIndices.length; i++) {
    const colIdx = multilineColIndices[i]!;
    const val = row[colIdx] ?? '';
    if (val.indexOf('\n') !== -1) {
      let explicitLines = 1;
      for (let p = val.indexOf('\n'); p !== -1; p = val.indexOf('\n', p + 1)) {
        explicitLines++;
      }
      if (explicitLines > maxLines) maxLines = explicitLines;
    }
  }

  if (maxLines <= 1) return options.defaultHeight;
  const lineHeight = Math.round(options.fontSize * 1.45);
  const computed = maxLines * lineHeight + 10;
  return Math.max(options.defaultHeight, Math.min(maxHeight, computed));
}
