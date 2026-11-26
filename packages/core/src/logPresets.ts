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
