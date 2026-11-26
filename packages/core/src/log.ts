import type {
  CsvEncoding,
  CsvLineEnding,
  LogParserConfig,
  MetaTextFormat,
} from '@meta-csv/schema';
import {
  decodeCsvBytes,
  detectLineEnding,
  encodeCsvText,
  type ParseProgress,
  type ParsedCsvData,
  type ResolvedLogOptions,
} from './csv';
import { parseJsonlLines } from './jsonl';
import {
  LOG_PRESETS,
  detectLogPreset,
  extractNamedCaptureGroups,
  type LogParserPreset,
} from './logPresets';

export {
  LOG_PRESETS,
  detectLogPreset,
  extractNamedCaptureGroups,
  type LogParserPreset,
} from './logPresets';
export {
  buildDefaultHighlightRules,
  type DefaultHighlightRuleOptions,
} from './logHighlight';

function tryParseIisW3c(
  lines: string[],
  sampleLines: string[],
  opts: {
    encoding: CsvEncoding;
    lineEnding: CsvLineEnding;
    wordWrap: boolean;
    format: MetaTextFormat;
  },
): ParsedCsvData | null {
  let fields: string[] | null = null;
  const limit = Math.min(lines.length, 25);
  for (let i = 0; i < limit; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith('#Fields:')) {
      const cols = trimmed
        .slice('#Fields:'.length)
        .trim()
        .split(/\s+/)
        .filter((c) => c.length > 0);
      if (cols.length > 0) {
        fields = cols;
        break;
      }
    }
  }
  if (!fields) return null;

  const colCount = fields.length;
  const rows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    const row = new Array<string>(colCount).fill('');
    for (let c = 0; c < colCount - 1 && c < parts.length; c++) {
      row[c] = parts[c]!;
    }
    if (parts.length >= colCount) {
      row[colCount - 1] = parts.slice(colCount - 1).join(' ');
    }
    rows.push(row);
  }

  return {
    headers: fields,
    rows,
    columnKeys: fields,
    dialect: { hasHeader: true, delimiter: ',', encoding: opts.encoding, lineEnding: opts.lineEnding },
    format: opts.format,
    logOptions: {
      linePattern: '',
      columnNames: fields,
      timestampColumn: fields.includes('date') ? 'date' : undefined,
      wordWrap: opts.wordWrap,
      encoding: opts.encoding,
      lineEnding: opts.lineEnding,
      matchedPresetId: 'iis-w3c',
    },
    invalidLineCount: 0,
    sampleLines,
  };
}

function isLikelyJsonLog(sampleLines: string[]): boolean {
  const nonEmpty = sampleLines.filter((l) => l.trim().length > 0).slice(0, 20);
  if (nonEmpty.length === 0) return false;
  let jsonCount = 0;
  for (const line of nonEmpty) {
    const t = line.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) continue;
    try {
      const parsed: unknown = JSON.parse(t);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        jsonCount++;
      }
    } catch {
      // Not valid JSON
    }
  }
  return jsonCount / nonEmpty.length >= 0.8;
}

interface PendingLogEntry {
  matched: boolean;
  values?: string[];
  raw?: string;
  continuations: string[];
}

export interface ParseLogLinesOptions {
  encoding?: CsvEncoding;
  lineEnding?: CsvLineEnding;
  format?: MetaTextFormat;
  onProgress?: (progress: ParseProgress) => void;
}

/**
 * Parse pre-split log lines using regex capture groups and optional multiline continuation folding.
 */
export function parseLogLines(
  rawLinesInput: string[],
  override?: LogParserConfig,
  opts: ParseLogLinesOptions = {},
): ParsedCsvData {
  const encoding: CsvEncoding = override?.encoding ?? opts.encoding ?? 'utf-8';
  const lineEnding: CsvLineEnding = opts.lineEnding ?? 'lf';
  const wordWrap = override?.wordWrap ?? false;
  const format: MetaTextFormat = opts.format ?? 'log';
  const onProgress = opts.onProgress;

  const lines =
    rawLinesInput.length > 0 && rawLinesInput[rawLinesInput.length - 1] === ''
      ? rawLinesInput.slice(0, -1)
      : rawLinesInput;

  const sampleLines: string[] = [];
  for (let i = 0; i < lines.length && sampleLines.length < 30; i++) {
    const l = lines[i]!;
    if (l.trim().length > 0) sampleLines.push(l);
  }

  // Zero-Config auto-detection for IIS W3C (#Fields:) and Docker/JSON (.log) files
  if (override?.linePattern === undefined) {
    const iisResult = tryParseIisW3c(lines, sampleLines, {
      encoding,
      lineEnding,
      wordWrap,
      format,
    });
    if (iisResult) return iisResult;

    if (isLikelyJsonLog(sampleLines)) {
      const jsonParsed = parseJsonlLines(
        lines,
        { encoding, lineEnding, flattenDepth: 2, arrayMode: 'json' },
        { encoding, lineEnding, format, onProgress },
      );
      const keys = jsonParsed.columnKeys;
      return {
        ...jsonParsed,
        format,
        logOptions: {
          linePattern: '',
          columnNames: keys,
          timestampColumn: keys.includes('time')
            ? 'time'
            : keys.includes('timestamp')
              ? 'timestamp'
              : undefined,
          levelColumn: keys.includes('level') ? 'level' : undefined,
          wordWrap,
          encoding,
          lineEnding,
          matchedPresetId: 'docker-json',
        },
        sampleLines,
      };
    }
  }

  let effectivePattern = '';
  let effectiveMultiline = override?.multilinePattern;
  let timestampColumn = override?.timestampColumn;
  let levelColumn = override?.levelColumn;
  let matchedPresetId: string | undefined;

  if (override?.linePattern === undefined) {
    const detected = detectLogPreset(sampleLines);
    effectivePattern = detected.linePattern;
    matchedPresetId = detected.id;
    if (effectiveMultiline === undefined) effectiveMultiline = detected.multilinePattern;
    if (timestampColumn === undefined) timestampColumn = detected.timestampColumn;
    if (levelColumn === undefined) levelColumn = detected.levelColumn;
  } else {
    effectivePattern = override.linePattern;
    const matchedPreset = LOG_PRESETS.find((p) => p.linePattern === effectivePattern);
    matchedPresetId = matchedPreset?.id;
    if (matchedPreset) {
      if (timestampColumn === undefined) timestampColumn = matchedPreset.timestampColumn;
      if (levelColumn === undefined) levelColumn = matchedPreset.levelColumn;
    }
  }

  const errors: string[] = [];
  let lineRe: RegExp | null = null;
  if (effectivePattern.length > 0) {
    try {
      lineRe = new RegExp(effectivePattern);
    } catch (err) {
      errors.push(`Invalid linePattern: ${err instanceof Error ? err.message : String(err)}`);
      lineRe = null;
    }
  }

  let multilineRe: RegExp | null = null;
  if (effectiveMultiline && effectiveMultiline.length > 0) {
    try {
      multilineRe = new RegExp(effectiveMultiline);
    } catch (err) {
      errors.push(`Invalid multilinePattern: ${err instanceof Error ? err.message : String(err)}`);
      multilineRe = null;
    }
  }

  const namedGroups = lineRe ? extractNamedCaptureGroups(effectivePattern) : [];
  const entries: PendingLogEntry[] = [];
  let invalidLineCount = 0;
  let maxNumberedGroups = 0;
  let lastNotify = 0;
  const totalLines = Math.max(1, lines.length);

  onProgress?.({ phase: 'parsing', percent: 20, rowsParsed: 0 });

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;

    if (multilineRe && entries.length > 0 && multilineRe.test(rawLine)) {
      entries[entries.length - 1]!.continuations.push(rawLine);
    } else if (!lineRe) {
      entries.push({
        matched: true,
        values: [rawLine],
        continuations: [],
      });
    } else {
      const m = lineRe.exec(rawLine);
      if (m) {
        if (namedGroups.length > 0) {
          const vals = namedGroups.map((name) => m.groups?.[name] ?? '');
          entries.push({ matched: true, values: vals, continuations: [] });
        } else {
          const vals: string[] = [];
          for (let g = 1; g < m.length; g++) {
            vals.push(m[g] ?? '');
          }
          if (vals.length === 0) {
            vals.push(m[0] ?? rawLine);
          }
          if (vals.length > maxNumberedGroups) {
            maxNumberedGroups = vals.length;
          }
          entries.push({ matched: true, values: vals, continuations: [] });
        }
      } else {
        invalidLineCount++;
        entries.push({ matched: false, raw: rawLine, continuations: [] });
      }
    }

    if (onProgress && (i & 0x3fff) === 0 && i > 0) {
      const now = performance.now();
      if (now - lastNotify >= 80) {
        lastNotify = now;
        const pct = Math.min(90, 20 + Math.round((i / totalLines) * 70));
        onProgress({ phase: 'parsing', percent: pct, rowsParsed: entries.length });
      }
    }
  }

  onProgress?.({ phase: 'finalizing', percent: 94, rowsParsed: entries.length });

  let baseColumns: string[];
  if (!lineRe) {
    const customPlainName = override?.columnNames?.[0]?.trim();
    baseColumns = [customPlainName || 'message'];
  } else if (namedGroups.length > 0) {
    baseColumns = [...namedGroups];
  } else {
    const count = Math.max(maxNumberedGroups, override?.columnNames?.length ?? 0);
    baseColumns = Array.from({ length: count }, (_, idx) => {
      const explicit = override?.columnNames?.[idx]?.trim();
      return explicit && explicit.length > 0 ? explicit : `col${idx + 1}`;
    });
  }

  const hasRawFallback = invalidLineCount > 0;
  let columnKeys: string[];
  if (hasRawFallback) {
    if (baseColumns.length === 0) {
      columnKeys = ['_raw'];
    } else if (baseColumns.includes('_raw')) {
      columnKeys = [...baseColumns];
    } else {
      columnKeys = [...baseColumns, '_raw'];
    }
  } else {
    columnKeys = baseColumns;
  }

  const colCount = columnKeys.length;
  const rawColIdx = columnKeys.indexOf('_raw');
  const messageColIdx = columnKeys.indexOf('message');
  const fallbackTargetCol =
    messageColIdx !== -1
      ? messageColIdx
      : baseColumns.length > 0
        ? baseColumns.length - 1
        : Math.max(0, colCount - 1);

  const rows: string[][] = new Array(entries.length);
  for (let r = 0; r < entries.length; r++) {
    const entry = entries[r]!;
    const dense = new Array<string>(colCount).fill('');

    if (entry.matched && entry.values) {
      for (let c = 0; c < entry.values.length && c < colCount; c++) {
        dense[c] = entry.values[c]!;
      }
      if (entry.continuations.length > 0 && colCount > 0) {
        const targetCol = Math.min(fallbackTargetCol, colCount - 1);
        const suffix = '\n' + entry.continuations.join('\n');
        dense[targetCol] = (dense[targetCol] ?? '') + suffix;
      }
    } else {
      const targetCol = rawColIdx !== -1 ? rawColIdx : 0;
      const suffix =
        entry.continuations.length > 0 ? '\n' + entry.continuations.join('\n') : '';
      dense[targetCol] = (entry.raw ?? '') + suffix;
    }

    rows[r] = dense;
  }

  onProgress?.({ phase: 'finalizing', percent: 100, rowsParsed: rows.length });

  const regexError = errors.length > 0 ? errors.join(' | ') : undefined;

  return {
    headers: columnKeys,
    rows,
    columnKeys,
    dialect: { hasHeader: true, delimiter: ',', encoding, lineEnding },
    format,
    logOptions: {
      linePattern: effectivePattern,
      columnNames: baseColumns,
      timestampColumn,
      levelColumn,
      multilinePattern: effectiveMultiline,
      wordWrap,
      encoding,
      lineEnding,
      matchedPresetId,
      regexError,
    },
    invalidLineCount,
    sampleLines,
  };
}

/**
 * Decode raw log file bytes and parse lines into a tabular grid.
 */
export function parseLogBytes(
  bytes: Uint8Array,
  override?: LogParserConfig,
  onProgress?: (progress: ParseProgress) => void,
  format: MetaTextFormat = 'log',
): ParsedCsvData {
  onProgress?.({ phase: 'decoding', percent: 5, rowsParsed: 0 });
  const { text, encoding } = decodeCsvBytes(bytes, override?.encoding);
  const lineEnding = detectLineEnding(text);
  const lines = text.split(/\r?\n/);
  return parseLogLines(lines, override, {
    encoding,
    lineEnding,
    format,
    onProgress,
  });
}

export interface LogPatternPreviewResult {
  columns: string[];
  rows: string[][];
  totalEntries: number;
  matchedEntries: number;
  unmatchedEntries: number;
  error?: string;
}

/**
 * Preview how a regex pattern & multiline configuration parses sample log lines inside Settings UI.
 */
export function previewLogPattern(
  sampleLines: string[],
  config: Pick<LogParserConfig, 'linePattern' | 'columnNames' | 'multilinePattern'>,
): LogPatternPreviewResult {
  const parsed = parseLogLines(sampleLines, {
    linePattern: config.linePattern ?? '',
    columnNames: config.columnNames,
    multilinePattern: config.multilinePattern,
  });
  const unmatched = parsed.invalidLineCount ?? 0;
  return {
    columns: parsed.columnKeys,
    rows: parsed.rows.slice(0, 6),
    totalEntries: parsed.rows.length,
    matchedEntries: Math.max(0, parsed.rows.length - unmatched),
    unmatchedEntries: unmatched,
    error: parsed.logOptions?.regexError,
  };
}

/**
 * Serialize log grid rows back into plain log text (used only when editing is explicitly unlocked).
 */
export function serializeLog(
  columnKeys: string[],
  rows: string[][],
  options: ResolvedLogOptions,
): Uint8Array {
  const newline = options.lineEnding === 'crlf' ? '\r\n' : '\n';
  const rawIdx = columnKeys.indexOf('_raw');
  const isPlain = columnKeys.length <= 1 && !options.linePattern;

  const outLines: string[] = new Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (isPlain) {
      outLines[r] = (row[0] ?? '').replace(/\r?\n/g, newline);
      continue;
    }
    if (rawIdx !== -1 && (row[rawIdx] ?? '').length > 0) {
      const hasOther = row.some((v, idx) => idx !== rawIdx && v.length > 0);
      if (!hasOther) {
        outLines[r] = row[rawIdx]!.replace(/\r?\n/g, newline);
        continue;
      }
    }

    const parts: string[] = [];
    for (let c = 0; c < columnKeys.length; c++) {
      if (c === rawIdx) continue;
      const v = row[c] ?? '';
      if (v.length > 0) parts.push(v.replace(/\r?\n/g, newline));
    }
    outLines[r] = parts.join(' ');
  }

  const text = outLines.length > 0 ? outLines.join(newline) + newline : '';
  return encodeCsvText(text, options.encoding);
}
