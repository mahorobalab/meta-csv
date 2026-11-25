import Papa from 'papaparse';
import type {
  CsvDelimiter,
  CsvDialectConfig,
  CsvEncoding,
  CsvLineEnding,
} from '@meta-csv/schema';

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
}

export function detectEncoding(bytes: Uint8Array): CsvEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8-bom';
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
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

export function parseCsvBytes(
  bytes: Uint8Array,
  override?: CsvDialectConfig,
): ParsedCsvData {
  const { text, encoding } = decodeCsvBytes(bytes, override?.encoding);
  const lineEnding = override?.lineEnding ?? detectLineEnding(text);
  const delimiter = override?.delimiter ?? detectDelimiter(text);
  const hasHeader = override?.hasHeader ?? true;

  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
  });

  const rawRows = parsed.data;
  const colCount = rawRows.reduce((max, r) => Math.max(max, r.length), 0);

  let headers: string[];
  let rows: string[][];
  let columnKeys: string[];

  if (hasHeader && rawRows.length > 0) {
    const firstRow = rawRows[0] ?? [];
    headers = Array.from({ length: colCount }, (_, i) => firstRow[i] ?? `column ${i + 1}`);
    rows = rawRows.slice(1).map((r) => normalizeRowLength(r, colCount));
    columnKeys = headers.map((h, i) => (h.trim().length > 0 ? h : String(i)));
  } else {
    headers = Array.from({ length: colCount }, (_, i) => `column ${i + 1}`);
    rows = rawRows.map((r) => normalizeRowLength(r, colCount));
    columnKeys = Array.from({ length: colCount }, (_, i) => String(i));
  }

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
