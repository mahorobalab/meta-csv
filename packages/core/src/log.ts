import type {
  CellStyle,
  ConditionalRule,
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

export interface LogParserPreset {
  id: string;
  label: string;
  description: string;
  linePattern: string;
  columnNames: string[];
  timestampColumn?: string;
  levelColumn?: string;
  multilinePattern?: string;
}

export const LOG_PRESETS: readonly LogParserPreset[] = [
  {
    id: 'iso-bracket',
    label: 'ISO8601 + [LEVEL] + Logger (Log4j / Logback)',
    description: '2026-11-26 10:00:01.123 [INFO] app.Service - Message',
    linePattern:
      '^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)\\s+\\[(?<level>[A-Z]+)\\]\\s+(?<logger>[\\w.$:-]+)\\s+-\\s+(?<message>.*)$',
    columnNames: ['timestamp', 'level', 'logger', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
    multilinePattern: '^(\\s+at\\s+|Caused by:|\\s+\\.\\.\\.\\s+\\d+\\s+more)',
  },
  {
    id: 'mysql-error',
    label: 'MySQL / MariaDB Error Log',
    description: '2026-11-26T10:00:01.123456Z 0 [Warning] [MY-010068] [Server] Message',
    linePattern:
      '^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)\\s+(?<threadId>\\d+)\\s+\\[(?<level>[A-Za-z]+)\\](?:\\s+\\[(?<errorCode>[^\\]]+)\\])?(?:\\s+\\[(?<subsystem>[^\\]]+)\\])?\\s+(?<message>.*)$',
    columnNames: ['timestamp', 'threadId', 'level', 'errorCode', 'subsystem', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
  },
  {
    id: 'postgres',
    label: 'PostgreSQL Server Log',
    description: '2026-11-26 10:00:01.123 JST [1234] ERROR:  duplicate key value',
    linePattern:
      '^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:\\s+[A-Z]{2,5}|Z|[+-]\\d{2}:?\\d{2})?)\\s+\\[(?<pid>\\d+)\\]\\s+(?<level>DEBUG\\d?|INFO|NOTICE|WARNING|ERROR|LOG|FATAL|PANIC|DETAIL|HINT|STATEMENT|CONTEXT):\\s+(?<message>.*)$',
    columnNames: ['timestamp', 'pid', 'level', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
    multilinePattern: '^\\t',
  },
  {
    id: 'nginx-error',
    label: 'Nginx Error Log',
    description: '2026/11/26 10:00:01 [error] 1024#1024: *12 upstream timed out',
    linePattern:
      '^(?<timestamp>\\d{4}\\/\\d{2}\\/\\d{2}\\s+\\d{2}:\\d{2}:\\d{2})\\s+\\[(?<level>[a-z]+)\\]\\s+(?<pid>\\d+#\\d+):\\s+(?:\\*(?<cid>\\d+)\\s+)?(?<message>.*)$',
    columnNames: ['timestamp', 'level', 'pid', 'cid', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
  },
  {
    id: 'laravel',
    label: 'PHP Laravel / Monolog',
    description: '[2026-11-26 10:00:01] production.ERROR: SQLSTATE[HY000]',
    linePattern:
      '^\\[(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?)\\]\\s+(?<env>[\\w-]+)\\.(?<level>[A-Z]+):\\s+(?<message>.*)$',
    columnNames: ['timestamp', 'env', 'level', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
    multilinePattern: '^(#\\d+\\s+|\\[stacktrace\\]|\\s+at\\s+|\\}$)',
  },
  {
    id: 'iso-level',
    label: 'ISO8601 + LEVEL (Python logging / Generic)',
    description: '2026-11-26 10:00:01,123 - worker - ERROR - Job failed',
    linePattern:
      '^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)\\s+(?:-\\s+(?<logger>[\\w.-]+)\\s+-\\s+)?\\[?(?<level>TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\\]?:?\\s+(?:(?:-|—)\\s+)?(?<message>.*)$',
    columnNames: ['timestamp', 'logger', 'level', 'message'],
    timestampColumn: 'timestamp',
    levelColumn: 'level',
    multilinePattern: '^(\\s+at\\s+|Caused by:|\\s+File\\s+"|Traceback\\s+\\(|\\s{2,}\\S)',
  },
  {
    id: 'apache-nginx',
    label: 'Apache / Nginx Access Log (Combined)',
    description: '127.0.0.1 - user [26/Nov/2026:10:00:01 +0900] "GET /api HTTP/1.1" 200 512',
    linePattern:
      '^(?<ip>\\S+)\\s+\\S+\\s+(?<user>\\S+)\\s+\\[(?<timestamp>[^\\]]+)\\]\\s+"(?<method>[A-Z]+)\\s+(?<path>[^"]*?)(?:\\s+HTTP\\/[\\d.]+)?"\\s+(?<status>\\d{3})\\s+(?<bytes>\\S+)(?:\\s+"(?<referer>[^"]*)"\\s+"(?<userAgent>[^"]*)")?',
    columnNames: ['ip', 'user', 'timestamp', 'method', 'path', 'status', 'bytes', 'referer', 'userAgent'],
    timestampColumn: 'timestamp',
  },
  {
    id: 'syslog',
    label: 'Linux Syslog / rsyslog (RFC 3164)',
    description: 'Nov 26 10:00:01 host sshd[1234]: Accepted publickey',
    linePattern:
      '^(?<timestamp>[A-Z][a-z]{2}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2})\\s+(?<host>\\S+)\\s+(?<process>[^\\[:]+)(?:\\[(?<pid>\\d+)\\])?:\\s*(?<message>.*)$',
    columnNames: ['timestamp', 'host', 'process', 'pid', 'message'],
    timestampColumn: 'timestamp',
  },
  {
    id: 'plain',
    label: 'Plain Lines (Single Column)',
    description: 'Keep each line as a single message column',
    linePattern: '',
    columnNames: ['message'],
  },
];

/**
 * Extract named capture group identifiers (?<name>...) in pattern order,
 * skipping character classes, escaped characters, and lookbehind assertions.
 */
export function extractNamedCaptureGroups(pattern: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[' && !inClass) {
      inClass = true;
      continue;
    }
    if (ch === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (inClass) continue;

    if (
      ch === '(' &&
      pattern[i + 1] === '?' &&
      pattern[i + 2] === '<' &&
      pattern[i + 3] !== '=' &&
      pattern[i + 3] !== '!'
    ) {
      const closeIdx = pattern.indexOf('>', i + 3);
      if (closeIdx > i + 3) {
        const name = pattern.slice(i + 3, closeIdx);
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
        i = closeIdx;
      }
    }
  }
  return names;
}

/**
 * Auto-detect the best matching built-in log preset from sample lines.
 */
export function detectLogPreset(sampleLines: string[]): LogParserPreset {
  const plain = LOG_PRESETS[LOG_PRESETS.length - 1]!;
  const nonEmpty = sampleLines.filter((l) => l.trim().length > 0).slice(0, 50);
  if (nonEmpty.length === 0) return plain;

  let bestPreset: LogParserPreset = plain;
  let bestRatio = 0;

  for (const preset of LOG_PRESETS) {
    if (!preset.linePattern) continue;
    let re: RegExp;
    try {
      re = new RegExp(preset.linePattern);
    } catch {
      continue;
    }
    let matched = 0;
    for (const line of nonEmpty) {
      if (re.test(line)) matched++;
    }
    const ratio = matched / nonEmpty.length;
    if (ratio >= 0.4 && ratio > bestRatio) {
      bestRatio = ratio;
      bestPreset = preset;
    }
  }

  return bestPreset;
}

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

export interface DefaultHighlightRuleOptions {
  format?: MetaTextFormat;
  levelColumn?: string;
  themeMode?: 'light' | 'dark';
}

const SEVERITY_COLUMN_NAMES = new Set(['level', 'severity', 'lvl', 'loglevel', 'log_level']);
const STATUS_COLUMN_NAMES = new Set([
  'status',
  'sc-status',
  'http_status',
  'status_code',
  'metrics.status',
]);

/**
 * Build Zero-Config conditional highlight rules for Log and JSONL files when the user
 * has not explicitly configured `rules` in `.metatext.jsonc`.
 */
export function buildDefaultHighlightRules(
  columnKeys: string[],
  options: DefaultHighlightRuleOptions = {},
): ConditionalRule[] {
  const format = options.format ?? 'csv';
  if (format !== 'log' && format !== 'jsonl') return [];

  const isDark = options.themeMode !== 'light';
  const errorStyle: CellStyle = {
    backgroundColor: isDark ? 'rgba(244, 63, 94, 0.18)' : 'rgba(244, 63, 94, 0.13)',
    color: isDark ? '#fecdd3' : '#be123c',
  };
  const warnStyle: CellStyle = {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.16)',
    color: isDark ? '#fde68a' : '#b45309',
  };
  const debugStyle: CellStyle = {
    color: isDark ? '#94a3b8' : '#64748b',
  };
  const redirectStyle: CellStyle = {
    color: isDark ? '#38bdf8' : '#0284c7',
  };

  const rules: ConditionalRule[] = [];

  // 1. Severity / log level column
  const levelCol =
    options.levelColumn && columnKeys.includes(options.levelColumn)
      ? options.levelColumn
      : columnKeys.find((k) => SEVERITY_COLUMN_NAMES.has(k.toLowerCase()));

  if (levelCol) {
    rules.push(
      {
        name: 'Default: Error / Fatal / Critical',
        target: 'row',
        when: {
          column: levelCol,
          operator: 'regex',
          value:
            '^(?:ERROR|Error|error|ERR|Err|err|FATAL|Fatal|fatal|CRIT|Crit|crit|CRITICAL|Critical|critical|ALERT|Alert|alert|EMERG|Emerg|emerg|PANIC|Panic|panic)$',
        },
        style: errorStyle,
      },
      {
        name: 'Default: Warning',
        target: 'row',
        when: {
          column: levelCol,
          operator: 'regex',
          value: '^(?:WARN|Warn|warn|WARNING|Warning|warning)$',
        },
        style: warnStyle,
      },
      {
        name: 'Default: Debug / Trace',
        target: 'row',
        when: {
          column: levelCol,
          operator: 'regex',
          value: '^(?:DEBUG\\d?|Debug\\d?|debug\\d?|TRACE|Trace|trace)$',
        },
        style: debugStyle,
      },
    );
  }

  // 2. HTTP status code column (Nginx / Apache / IIS / JSONL metrics.status)
  const statusCol = columnKeys.find((k) => STATUS_COLUMN_NAMES.has(k.toLowerCase()));
  if (statusCol) {
    rules.push(
      {
        name: 'Default: HTTP 5xx Server Error',
        target: 'row',
        when: { column: statusCol, operator: 'regex', value: '^5\\d\\d$' },
        style: errorStyle,
      },
      {
        name: 'Default: HTTP 4xx Client Error',
        target: 'row',
        when: { column: statusCol, operator: 'regex', value: '^4\\d\\d$' },
        style: warnStyle,
      },
      {
        name: 'Default: HTTP 3xx Redirect',
        target: 'cell',
        when: { column: statusCol, operator: 'regex', value: '^3\\d\\d$' },
        style: redirectStyle,
      },
    );
  }

  // 3. Docker JSON stream column
  if (!levelCol && columnKeys.includes('stream')) {
    rules.push({
      name: 'Default: stderr stream',
      target: 'row',
      when: { column: 'stream', operator: 'equals', value: 'stderr' },
      style: errorStyle,
    });
  }

  // 4. Fallback message keyword highlight for syslog / plain logs
  if (rules.length === 0) {
    const msgCol = columnKeys.includes('message')
      ? 'message'
      : columnKeys.includes('log')
        ? 'log'
        : undefined;
    if (msgCol) {
      rules.push(
        {
          name: 'Default: Error Keywords',
          target: 'row',
          when: {
            column: msgCol,
            operator: 'regex',
            value:
              '\\b(?:ERROR|FATAL|CRITICAL|Failed password|Invalid user|Out of memory|segfault|Exception)\\b',
          },
          style: errorStyle,
        },
        {
          name: 'Default: Warning Keywords',
          target: 'row',
          when: {
            column: msgCol,
            operator: 'regex',
            value: '\\b(?:WARN|WARNING|timed out|refused|denied)\\b',
          },
          style: warnStyle,
        },
      );
    }
  }

  return rules;
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
