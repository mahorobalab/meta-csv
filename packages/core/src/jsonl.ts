import type {
  CsvEncoding,
  CsvLineEnding,
  JsonlArrayMode,
  JsonlParserConfig,
  MetaTextFormat,
} from '@meta-csv/schema';
import {
  decodeCsvBytes,
  detectLineEnding,
  encodeCsvText,
  type ParseProgress,
  type ParsedCsvData,
  type ResolvedJsonlOptions,
} from './csv';

const DEFAULT_FLATTEN_DEPTH = 2;
const DEFAULT_ARRAY_MODE: JsonlArrayMode = 'json';
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CANONICAL_JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Determine target plain-text format from explicit .metatext.jsonc 'format' or filename extension.
 */
export function detectTargetFormat(
  fileName: string,
  explicitFormat?: MetaTextFormat,
): MetaTextFormat {
  if (explicitFormat) return explicitFormat;
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.log')) return 'log';
  return 'csv';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatArrayCell(arr: unknown[], arrayMode: JsonlArrayMode): string {
  if (
    arrayMode === 'join' &&
    arr.every(
      (item) =>
        item === null ||
        item === undefined ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    )
  ) {
    return arr.map((item) => (item === null || item === undefined ? '' : String(item))).join(', ');
  }
  return JSON.stringify(arr);
}

function flattenObjectEntries(
  obj: Record<string, unknown>,
  prefix: string,
  depth: number,
  flattenDepth: number,
  arrayMode: JsonlArrayMode,
  out: Array<[string, string]>,
): void {
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) {
    out.push([prefix, '{}']);
    return;
  }
  for (const key of keys) {
    const val = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined) {
      out.push([fullKey, '']);
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out.push([fullKey, String(val)]);
    } else if (Array.isArray(val)) {
      out.push([fullKey, formatArrayCell(val, arrayMode)]);
    } else if (isPlainObject(val)) {
      if (depth < flattenDepth && Object.keys(val).length > 0) {
        flattenObjectEntries(val, fullKey, depth + 1, flattenDepth, arrayMode, out);
      } else {
        out.push([fullKey, JSON.stringify(val)]);
      }
    } else {
      out.push([fullKey, String(val)]);
    }
  }
}

export interface ParseJsonlLinesOptions {
  encoding?: CsvEncoding;
  lineEnding?: CsvLineEnding;
  format?: MetaTextFormat;
  onProgress?: (progress: ParseProgress) => void;
}

/**
 * Parse pre-split JSON Lines into a flat tabular grid, scanning all rows
 * so sparse keys appearing on later lines become grid columns automatically.
 */
export function parseJsonlLines(
  lines: string[],
  override?: JsonlParserConfig,
  opts: ParseJsonlLinesOptions = {},
): ParsedCsvData {
  const encoding: CsvEncoding = override?.encoding ?? opts.encoding ?? 'utf-8';
  const lineEnding: CsvLineEnding = override?.lineEnding ?? opts.lineEnding ?? 'lf';
  const format: MetaTextFormat = opts.format ?? 'jsonl';
  const onProgress = opts.onProgress;
  const flattenDepth = Math.max(
    0,
    Math.min(8, Math.floor(override?.flattenDepth ?? DEFAULT_FLATTEN_DEPTH)),
  );
  const arrayMode: JsonlArrayMode = override?.arrayMode ?? DEFAULT_ARRAY_MODE;

  onProgress?.({ phase: 'parsing', percent: 20, rowsParsed: 0 });

  const keys: string[] = [];
  const colIndexByKey = new Map<string, number>();
  const sparseRows: Array<Array<[number, string]>> = [];
  let invalidLineCount = 0;
  let lastNotify = 0;

  const ensureCol = (key: string): number => {
    const existing = colIndexByKey.get(key);
    if (existing !== undefined) return existing;
    const idx = keys.length;
    keys.push(key);
    colIndexByKey.set(key, idx);
    return idx;
  };

  const totalLines = Math.max(1, lines.length);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    if (rawLine.trim().length === 0) continue;

    const sparse: Array<[number, string]> = [];
    try {
      const parsed: unknown = JSON.parse(rawLine);
      if (isPlainObject(parsed)) {
        const entries: Array<[string, string]> = [];
        flattenObjectEntries(parsed, '', 0, flattenDepth, arrayMode, entries);
        for (const [k, v] of entries) {
          sparse.push([ensureCol(k), v]);
        }
      } else {
        const valStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        sparse.push([ensureCol('_value'), valStr]);
      }
    } catch {
      invalidLineCount++;
      sparse.push([ensureCol('_raw'), rawLine]);
    }
    sparseRows.push(sparse);

    if (onProgress && (i & 0x3fff) === 0 && i > 0) {
      const now = performance.now();
      if (now - lastNotify >= 80) {
        lastNotify = now;
        const pct = Math.min(90, 20 + Math.round((i / totalLines) * 70));
        onProgress({ phase: 'parsing', percent: pct, rowsParsed: sparseRows.length });
      }
    }
  }

  onProgress?.({ phase: 'finalizing', percent: 94, rowsParsed: sparseRows.length });

  const colCount = keys.length;
  const rows: string[][] = new Array(sparseRows.length);
  for (let r = 0; r < sparseRows.length; r++) {
    const dense = new Array<string>(colCount).fill('');
    const entries = sparseRows[r]!;
    for (let e = 0; e < entries.length; e++) {
      const [colIdx, val] = entries[e]!;
      dense[colIdx] = val;
    }
    rows[r] = dense;
  }

  onProgress?.({ phase: 'finalizing', percent: 100, rowsParsed: rows.length });

  return {
    headers: keys,
    rows,
    columnKeys: keys,
    dialect: { hasHeader: true, delimiter: ',', encoding, lineEnding },
    format,
    jsonlOptions: {
      flattenDepth,
      arrayMode,
      encoding,
      lineEnding,
    },
    invalidLineCount,
  };
}

/**
 * Parse JSON Lines (.jsonl / .ndjson) bytes into a flat tabular grid, scanning all rows
 * so sparse keys appearing on later lines become grid columns automatically.
 */
export function parseJsonlBytes(
  bytes: Uint8Array,
  override?: JsonlParserConfig,
  onProgress?: (progress: ParseProgress) => void,
): ParsedCsvData {
  onProgress?.({ phase: 'decoding', percent: 5, rowsParsed: 0 });
  const { text, encoding } = decodeCsvBytes(bytes, override?.encoding);
  const lineEnding = override?.lineEnding ?? detectLineEnding(text);
  const lines = text.split(/\r?\n/);
  return parseJsonlLines(lines, override, {
    encoding,
    lineEnding,
    format: 'jsonl',
    onProgress,
  });
}

function parseCellToJsonValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  // Preserve leading-zero identifiers like "001" as strings
  if (CANONICAL_JSON_NUMBER_RE.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function assignNestedValue(target: Record<string, unknown>, pathSegments: string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < pathSegments.length; i++) {
    const seg = pathSegments[i]!;
    if (!seg || UNSAFE_KEYS.has(seg)) return;
    if (i === pathSegments.length - 1) {
      cursor[seg] = value;
    } else {
      const existing = cursor[seg];
      if (!isPlainObject(existing)) {
        const next: Record<string, unknown> = {};
        cursor[seg] = next;
        cursor = next;
      } else {
        cursor = existing;
      }
    }
  }
}

/**
 * Serialize flattened grid rows back into JSON Lines (.jsonl), reconstructing nested objects
 * from dot-notation column keys and preserving leading-zero strings and raw fallback lines.
 */
export function serializeJsonl(
  columnKeys: string[],
  rows: string[][],
  options: ResolvedJsonlOptions,
): Uint8Array {
  const newline = options.lineEnding === 'crlf' ? '\r\n' : '\n';
  const rawIdx = columnKeys.indexOf('_raw');
  const valIdx = columnKeys.indexOf('_value');
  const splitKeys = columnKeys.map((k) => k.split('.'));

  const outLines: string[] = new Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];

    if (rawIdx !== -1 && (row[rawIdx] ?? '').length > 0) {
      const hasOther = row.some((v, idx) => idx !== rawIdx && v.length > 0);
      if (!hasOther) {
        outLines[r] = row[rawIdx]!;
        continue;
      }
    }

    if (valIdx !== -1 && (row[valIdx] ?? '').length > 0) {
      const hasOther = row.some((v, idx) => idx !== valIdx && v.length > 0);
      if (!hasOther) {
        outLines[r] = JSON.stringify(parseCellToJsonValue(row[valIdx]!));
        continue;
      }
    }

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < columnKeys.length; c++) {
      const val = row[c] ?? '';
      if (val === '') continue;
      assignNestedValue(obj, splitKeys[c]!, parseCellToJsonValue(val));
    }
    outLines[r] = JSON.stringify(obj);
  }

  const text = outLines.length > 0 ? outLines.join(newline) + newline : '';
  return encodeCsvText(text, options.encoding);
}
