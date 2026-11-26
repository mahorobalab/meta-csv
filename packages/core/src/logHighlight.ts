import type { CellStyle, ConditionalRule, MetaTextFormat } from '@meta-csv/schema';

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
