import { describe, expect, it } from 'vitest';
import {
  UndoRedoHistory,
  applyViewFilter,
  buildDefaultHighlightRules,
  buildSortedRowIndices,
  computeColumnFacets,
  createStyleResolverContext,
  detectTargetFormat,
  estimateAutoRowHeight,
  estimateWrappedLineCount,
  formatCellValue,
  indexToExcelColumn,
  isValidNumberFormat,
  parseCsvBytes,
  parseJsonlBytes,
  parseLogBytes,
  parseLogLines,
  parseMetaJsonc,
  patchMetaJsonc,
  previewLogPattern,
  resolveCellStyle,
  serializeCsv,
  serializeJsonl,
  serializeLog,
} from '../index';

describe('@meta-csv/core', () => {
  it('preserves comments when patching JSONC metadata', () => {
    const original = [
      '{',
      '  "version": "0.1",',
      '  // keep this user comment',
      '  "columns": {',
      '    "0": {',
      '      "width": 100',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');

    const updated = patchMetaJsonc(original, ['columns', '0', 'width'], 240);
    expect(updated).toContain('// keep this user comment');
    const parsed = parseMetaJsonc(updated);
    expect(parsed.columns?.['0']?.width).toBe(240);
  });

  it('detects and preserves CSV dialect (CRLF + UTF-8 BOM)', () => {
    const raw = '\uFEFFid,name\r\n1,Alice\r\n2,Bob';
    const bytes = new TextEncoder().encode(raw);
    const parsed = parseCsvBytes(bytes);

    expect(parsed.dialect.encoding).toBe('utf-8-bom');
    expect(parsed.dialect.lineEnding).toBe('crlf');
    expect(parsed.headers).toEqual(['id', 'name']);
    expect(parsed.rows).toEqual([
      ['1', 'Alice'],
      ['2', 'Bob'],
    ]);

    const saved = serializeCsv(parsed.headers, parsed.rows, parsed.dialect);
    expect(saved[0]).toBe(0xef);
    expect(saved[1]).toBe(0xbb);
    expect(saved[2]).toBe(0xbf);
  });

  it('resolves 5-layer styles (column -> rule -> range -> row -> cell)', () => {
    const meta = parseMetaJsonc(`{
      "version": "0.1",
      "styles": {
        "blue": { "backgroundColor": "#00f" },
        "green": { "backgroundColor": "#0f0", "italic": true }
      },
      "columns": { "1": { "style": { "bold": true } } },
      "rules": [
        { "when": { "column": "1", "operator": "equals", "value": "AppA" }, "style": "blue" }
      ],
      "ranges": [
        { "ref": "0:0..2:2", "style": "green" }
      ],
      "cells": {
        "1:1": { "color": "#f00", "wrap": true }
      }
    }`);

    const ctx = createStyleResolverContext(meta, ['0', '1', '2']);
    const style = resolveCellStyle(ctx, 1, 1, ['A-1', 'AppA', 'Note']);
    expect(style).toEqual({
      bold: true,
      backgroundColor: '#0f0',
      italic: true,
      color: '#f00',
      wrap: true,
    });
  });

  it('sorts view indices without mutating CSV rows', () => {
    const rows = [
      ['B-2', 'second'],
      ['A-10', 'tenth'],
      ['A-2', 'first'],
    ];
    const indices = buildSortedRowIndices(rows, ['0', '1'], [
      { column: '0', direction: 'asc' },
    ]);
    expect(Array.from(indices)).toEqual([2, 1, 0]);
    expect(rows[0]?.[0]).toBe('B-2');
  });

  it('supports command-based undo and redo for cells and rows', () => {
    const rows = [['hello', 'world']];
    const history = new UndoRedoHistory();
    rows[0]![1] = 'meta-csv';
    history.push({
      type: 'editCells',
      changes: [{ dataRow: 0, col: 1, before: 'world', after: 'meta-csv' }],
    });

    history.undo(rows);
    expect(rows[0]![1]).toBe('world');
    history.redo(rows);
    expect(rows[0]![1]).toBe('meta-csv');

    const inserted = ['new', 'row'];
    rows.splice(1, 0, inserted);
    history.push({ type: 'insertRow', index: 1, row: [...inserted] });
    expect(rows.length).toBe(2);

    history.undo(rows);
    expect(rows.length).toBe(1);
    history.redo(rows);
    expect(rows.length).toBe(2);
    expect(rows[1]).toEqual(['new', 'row']);
  });

  it('supports regex, NOT, numeric compare, grep -C context, dedupe, and facets', () => {
    const rows = [
      ['1', 'AppA', 'ok', '100'],
      ['2', 'AppA', 'ok', '200'],
      ['3', 'AppB', 'blocked', '50000'],
      ['4', 'AppC', 'review', '80000'],
      ['5', 'AppA', 'ok', '300'],
    ];
    const base = Int32Array.from([0, 1, 2, 3, 4]);
    const lookup = new Map([
      ['id', 0],
      ['app', 1],
      ['status', 2],
      ['amount', 3],
    ]);

    // Regex + NOT + numeric compare
    const res1 = applyViewFilter(rows, base, {
      query: 'status:/^(blocked|review)$/ -app:AppC amount:>=50000',
      columnLookup: lookup,
    });
    expect(Array.from(res1.indices)).toEqual([2]);

    // OR operator
    const resOr = applyViewFilter(rows, base, {
      query: 'status:=blocked OR app:=AppC',
      columnLookup: lookup,
    });
    expect(Array.from(resOr.indices)).toEqual([2, 3]);

    // Context rows (grep -C 1) around row index 2 -> keeps 1, 2, 3
    const res2 = applyViewFilter(rows, base, {
      query: 'status:=blocked',
      contextRows: 1,
      columnLookup: lookup,
    });
    expect(Array.from(res2.indices)).toEqual([1, 2, 3]);
    expect(res2.matchedRowSet?.has(2)).toBe(true);
    expect(res2.matchedRowSet?.has(1)).toBe(false);

    // Consecutive duplicate collapse on status column (rows 0 and 1 are both 'ok')
    const res3 = applyViewFilter(rows, base, {
      query: '',
      collapseColIndex: 2,
      columnLookup: lookup,
    });
    expect(Array.from(res3.indices)).toEqual([0, 2, 3, 4]);
    expect(res3.collapsedCounts?.get(0)).toBe(1);

    // Facet ranking
    const facets = computeColumnFacets(rows, base, 2);
    expect(facets.entries[0]).toEqual({ value: 'ok', count: 3 });
    expect(facets.uniqueCount).toBe(3);
  });

  it('persists view.markers with color and note while preserving JSONC comments', () => {
    const original = [
      '{',
      '  "version": "0.1",',
      '  // keep marker test comment',
      '  "view": {',
      '    "activeFilter": "status:blocked"',
      '  }',
      '}',
      '',
    ].join('\n');

    const updated = patchMetaJsonc(original, ['view', 'markers'], [
      { row: 2, color: 'rose', note: 'Investigate timeout' },
      { row: 10, color: 'amber' },
    ]);

    expect(updated).toContain('// keep marker test comment');
    const parsed = parseMetaJsonc(updated);
    expect(parsed.view?.activeFilter).toBe('status:blocked');
    expect(parsed.view?.markers).toEqual([
      { row: 2, color: 'rose', note: 'Investigate timeout' },
      { row: 10, color: 'amber' },
    ]);
  });

  it('converts 0-based column indices to Excel-style column letters', () => {
    expect(indexToExcelColumn(0)).toBe('A');
    expect(indexToExcelColumn(1)).toBe('B');
    expect(indexToExcelColumn(25)).toBe('Z');
    expect(indexToExcelColumn(26)).toBe('AA');
    expect(indexToExcelColumn(27)).toBe('AB');
    expect(indexToExcelColumn(701)).toBe('ZZ');
    expect(indexToExcelColumn(702)).toBe('AAA');
  });

  it('supports .metatext.jsonc log fields, readOnly, and preserves extensions/x-* across patches', () => {
    const original = [
      '{',
      '  "version": "0.1",',
      '  "format": "log",',
      '  "readOnly": true,',
      '  // keep log parser settings intact',
      '  "log": {',
      '    "linePattern": "^(?<timestamp>\\\\S+)\\\\s+(?<level>\\\\w+)\\\\s+(?<message>.*)$",',
      '    "levelColumn": "level",',
      '    "wordWrap": false',
      '  },',
      '  "extensions": {',
      '    "metalog": { "tailFollow": true }',
      '  },',
      '  "x-customTool": { "enabled": true }',
      '}',
      '',
    ].join('\n');

    const updated = patchMetaJsonc(original, ['view', 'filterContextRows'], 3);
    expect(updated).toContain('// keep log parser settings intact');
    const parsed = parseMetaJsonc(updated);
    expect(parsed.format).toBe('log');
    expect(parsed.readOnly).toBe(true);
    expect(parsed.log?.levelColumn).toBe('level');
    expect(parsed.log?.wordWrap).toBe(false);
    expect(parsed.extensions).toEqual({ metalog: { tailFollow: true } });
    expect(parsed['x-customTool']).toEqual({ enabled: true });
    expect(parsed.view?.filterContextRows).toBe(3);
  });

  it('detects target formats and parses/serializes JSONL with dot-flattening and sparse keys', () => {
    expect(detectTargetFormat('events.jsonl')).toBe('jsonl');
    expect(detectTargetFormat('stream.NDJSON')).toBe('jsonl');
    expect(detectTargetFormat('metrics.tsv')).toBe('tsv');
    expect(detectTargetFormat('app.log')).toBe('log');
    expect(detectTargetFormat('data.txt', 'jsonl')).toBe('jsonl');

    const jsonlText = [
      '{"id":"001","level":"INFO","user":{"id":"u1","meta":{"tier":"pro"}},"tags":["a","b"]}',
      '{"id":"002","level":"ERROR","user":{"id":"u2"},"error":{"code":"E500","retry":true},"latency":42}',
      'not valid json line',
    ].join('\r\n');
    const bytes = new TextEncoder().encode(jsonlText);

    const parsedDepth2 = parseJsonlBytes(bytes, { flattenDepth: 2, arrayMode: 'json' });
    expect(parsedDepth2.format).toBe('jsonl');
    expect(parsedDepth2.invalidLineCount).toBe(1);
    expect(parsedDepth2.dialect.lineEnding).toBe('crlf');
    expect(parsedDepth2.columnKeys).toEqual([
      'id',
      'level',
      'user.id',
      'user.meta.tier',
      'tags',
      'error.code',
      'error.retry',
      'latency',
      '_raw',
    ]);
    expect(parsedDepth2.rows[0]!.length).toBe(9);
    expect(parsedDepth2.rows[0]![0]).toBe('001');
    expect(parsedDepth2.rows[0]![3]).toBe('pro');
    expect(parsedDepth2.rows[0]![4]).toBe('["a","b"]');
    expect(parsedDepth2.rows[1]![5]).toBe('E500');
    expect(parsedDepth2.rows[2]![8]).toBe('not valid json line');

    const parsedDepth0 = parseJsonlBytes(bytes, { flattenDepth: 0, arrayMode: 'join' });
    expect(parsedDepth0.columnKeys).toContain('user');
    expect(parsedDepth0.columnKeys).not.toContain('user.id');
    expect(parsedDepth0.rows[0]![parsedDepth0.columnKeys.indexOf('tags')]).toBe('a, b');

    const reencoded = serializeJsonl(
      parsedDepth2.columnKeys,
      parsedDepth2.rows,
      parsedDepth2.jsonlOptions!,
    );
    const outLines = new TextDecoder().decode(reencoded).trimEnd().split('\r\n');
    expect(JSON.parse(outLines[0]!)).toEqual({
      id: '001',
      level: 'INFO',
      user: { id: 'u1', meta: { tier: 'pro' } },
      tags: ['a', 'b'],
    });
    expect(JSON.parse(outLines[1]!)).toEqual({
      id: '002',
      level: 'ERROR',
      user: { id: 'u2' },
      error: { code: 'E500', retry: true },
      latency: 42,
    });
    expect(outLines[2]).toBe('not valid json line');
  });

  it('parses log lines with named groups, multiline folding, _raw fallback, and round-trips', () => {
    const logText = [
      '=== App Startup Banner ===',
      '2026-11-26 10:00:01.120 [INFO] auth.Service - User login ok',
      '2026-11-26 10:00:02.450 [ERROR] db.Pool - Connection timeout',
      '\tat db.Pool.acquire(Pool.java:42)',
      'Caused by: java.net.SocketTimeoutException: connect timed out',
    ].join('\r\n');

    const bytes = new TextEncoder().encode('\uFEFF' + logText);
    const parsed = parseLogBytes(bytes, {
      linePattern:
        '^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?)\\s+\\[(?<level>[A-Z]+)\\]\\s+(?<logger>[\\w.-]+)\\s+-\\s+(?<message>.*)$',
      multilinePattern: '^(\\s+at\\s+|Caused by:)',
    });

    expect(parsed.format).toBe('log');
    expect(parsed.dialect.encoding).toBe('utf-8-bom');
    expect(parsed.dialect.lineEnding).toBe('crlf');
    expect(parsed.invalidLineCount).toBe(1);
    expect(parsed.columnKeys).toEqual(['timestamp', 'level', 'logger', 'message', '_raw']);
    expect(parsed.rows.length).toBe(3);
    expect(parsed.rows[0]).toEqual(['', '', '', '', '=== App Startup Banner ===']);
    expect(parsed.rows[1]).toEqual([
      '2026-11-26 10:00:01.120',
      'INFO',
      'auth.Service',
      'User login ok',
      '',
    ]);
    expect(parsed.rows[2]![1]).toBe('ERROR');
    expect(parsed.rows[2]![3]).toContain('Connection timeout\n\tat db.Pool.acquire');
    expect(parsed.rows[2]![3]).toContain('Caused by: java.net.SocketTimeoutException');

    const serialized = serializeLog(parsed.columnKeys, parsed.rows, parsed.logOptions!);
    expect(serialized[0]).toBe(0xef);
    expect(serialized[1]).toBe(0xbb);
    expect(serialized[2]).toBe(0xbf);
    const textOut = new TextDecoder().decode(serialized.subarray(3));
    expect(textOut).toContain('=== App Startup Banner ===\r\n');
    expect(textOut).toContain('Connection timeout\r\n\tat db.Pool.acquire');
  });

  it('auto-detects log presets, supports numbered capture groups, and handles invalid regex safely', () => {
    const autoParsed = parseLogLines([
      '127.0.0.1 - alice [26/Nov/2026:10:00:01 +0900] "GET /api/items HTTP/1.1" 200 1024',
      '10.0.0.5 - bob [26/Nov/2026:10:00:02 +0900] "POST /api/login HTTP/1.1" 401 128',
    ]);
    expect(autoParsed.logOptions?.matchedPresetId).toBe('apache-nginx');
    expect(autoParsed.columnKeys).toContain('method');
    expect(autoParsed.rows[1]![autoParsed.columnKeys.indexOf('status')]).toBe('401');

    const numbered = parseLogLines(
      ['WARN|worker-1|Queue high', 'ERR|worker-2|Disk full'],
      { linePattern: '^(\\w+)\\|([^|]+)\\|(.*)$', columnNames: ['level', 'worker', 'msg'] },
    );
    expect(numbered.columnKeys).toEqual(['level', 'worker', 'msg']);
    expect(numbered.rows[0]).toEqual(['WARN', 'worker-1', 'Queue high']);

    const badRegex = parseLogLines(['line 1', 'line 2'], { linePattern: '([unclosed' });
    expect(badRegex.logOptions?.regexError).toContain('Invalid linePattern');
    expect(badRegex.columnKeys).toEqual(['message']);
    expect(badRegex.rows).toEqual([['line 1'], ['line 2']]);

    const preview = previewLogPattern(
      ['2026-11-26 10:00:01 [INFO] svc - hello', 'bad line'],
      {
        linePattern:
          '^(?<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\s+\\[(?<level>[A-Z]+)\\]\\s+(?<logger>\\S+)\\s+-\\s+(?<message>.*)$',
      },
    );
    expect(preview.matchedEntries).toBe(1);
    expect(preview.unmatchedEntries).toBe(1);
    expect(preview.columns).toEqual(['timestamp', 'level', 'logger', 'message', '_raw']);
  });

  it('auto-detects nginx error, mysql, postgres, laravel, IIS W3C, and Docker JSON logs', () => {
    const nginxErr = parseLogLines([
      '2026/11/26 10:00:01 [error] 1024#1024: *12 upstream timed out (110: Connection timed out)',
      '2026/11/26 10:00:02 [warn] 1024#1024: *13 an upstream response is buffered',
    ]);
    expect(nginxErr.logOptions?.matchedPresetId).toBe('nginx-error');
    expect(nginxErr.rows[0]![nginxErr.columnKeys.indexOf('level')]).toBe('error');

    const mysqlErr = parseLogLines([
      '2026-11-26T10:00:01.123456Z 0 [Warning] [MY-010068] [Server] CA certificate is self signed.',
      '2026-11-26T10:00:02.654321Z 14 [ERROR] [MY-013132] [Server] Connection refused',
    ]);
    expect(mysqlErr.logOptions?.matchedPresetId).toBe('mysql-error');
    expect(mysqlErr.rows[1]![mysqlErr.columnKeys.indexOf('errorCode')]).toBe('MY-013132');

    const pgLog = parseLogLines([
      '2026-11-26 10:00:01.123 JST [1234] ERROR:  duplicate key value violates unique constraint',
      '2026-11-26 10:00:01.124 JST [1234] STATEMENT:  INSERT INTO users (id) VALUES (1);',
      '\tON CONFLICT DO NOTHING',
    ]);
    expect(pgLog.logOptions?.matchedPresetId).toBe('postgres');
    expect(pgLog.rows.length).toBe(2);
    expect(pgLog.rows[1]![pgLog.columnKeys.indexOf('message')]).toContain('\n\tON CONFLICT');

    const laravelLog = parseLogLines([
      '[2026-11-26 10:00:01] production.ERROR: SQLSTATE[HY000] [2002] Connection refused',
      '#0 /var/www/vendor/laravel/framework/Connection.php(664): PDO->__construct()',
      '[2026-11-26 10:00:02] production.INFO: Queue worker started',
    ]);
    expect(laravelLog.logOptions?.matchedPresetId).toBe('laravel');
    expect(laravelLog.rows.length).toBe(2);
    expect(laravelLog.rows[0]![laravelLog.columnKeys.indexOf('message')]).toContain('#0 /var/www');

    const iisLog = parseLogLines([
      '#Software: Microsoft Internet Information Services 10.0',
      '#Fields: date time s-ip cs-method cs-uri-stem sc-status time-taken',
      '2026-11-26 10:00:01 10.0.0.10 GET /api/health 200 12',
      '2026-11-26 10:00:02 10.0.0.10 POST /api/orders 500 3102',
    ]);
    expect(iisLog.logOptions?.matchedPresetId).toBe('iis-w3c');
    expect(iisLog.columnKeys).toEqual([
      'date',
      'time',
      's-ip',
      'cs-method',
      'cs-uri-stem',
      'sc-status',
      'time-taken',
    ]);
    expect(iisLog.rows[1]![5]).toBe('500');

    const dockerJson = parseLogLines([
      '{"log":"Server listening on :8080\\n","stream":"stdout","time":"2026-11-26T10:00:01.000Z"}',
      '{"log":"ERROR: DB connection lost\\n","stream":"stderr","time":"2026-11-26T10:00:02.000Z"}',
    ]);
    expect(dockerJson.logOptions?.matchedPresetId).toBe('docker-json');
    expect(dockerJson.columnKeys).toEqual(['log', 'stream', 'time']);
  });

  it('builds default highlight rules for log levels, HTTP status codes, and stderr', () => {
    expect(buildDefaultHighlightRules(['id', 'status'], { format: 'csv' })).toEqual([]);

    const levelRules = buildDefaultHighlightRules(['timestamp', 'level', 'message'], {
      format: 'log',
      levelColumn: 'level',
      themeMode: 'dark',
    });
    expect(levelRules.length).toBe(3);

    const ctx = createStyleResolverContext({ version: '0.1', rules: levelRules }, [
      'timestamp',
      'level',
      'message',
    ]);
    const errStyle = resolveCellStyle(ctx, 0, 2, ['t', 'ERROR', 'boom']);
    expect(errStyle?.backgroundColor).toContain('244, 63, 94');

    const nginxRules = buildDefaultHighlightRules(['ip', 'status', 'path'], {
      format: 'log',
      themeMode: 'light',
    });
    const nginxCtx = createStyleResolverContext({ version: '0.1', rules: nginxRules }, [
      'ip',
      'status',
      'path',
    ]);
    expect(resolveCellStyle(nginxCtx, 0, 0, ['1.1.1.1', '502', '/'])?.backgroundColor).toContain(
      '244, 63, 94',
    );
    expect(resolveCellStyle(nginxCtx, 1, 1, ['1.1.1.1', '301', '/'])?.color).toBe('#0284c7');

    const dockerRules = buildDefaultHighlightRules(['log', 'stream', 'time'], {
      format: 'log',
    });
    expect(dockerRules[0]?.when.column).toBe('stream');
    expect(dockerRules[0]?.when.value).toBe('stderr');
  });

  it('estimates wrapped line counts and auto row height for multiline and wrapped cells', () => {
    expect(estimateWrappedLineCount('short text', 200, 13)).toBe(1);
    expect(estimateWrappedLineCount('line1\nline2\nline3', 200, 13)).toBe(3);

    const longJp = '日本語の長文テキストが狭いセルの中で折り返されるケースのテスト';
    expect(estimateWrappedLineCount(longJp, 120, 13)).toBeGreaterThan(2);

    expect(
      estimateAutoRowHeight(['a', 'b'], [{ colIdx: 1, widthPx: 180 }], [0], {
        defaultHeight: 28,
        fontSize: 13,
      }),
    ).toBe(28);

    const expanded = estimateAutoRowHeight(
      ['err', 'Timeout\n\tat Pool.acquire\nCaused by: SocketTimeoutException'],
      [],
      [0, 1],
      { defaultHeight: 28, fontSize: 13, maxHeight: 240 },
    );
    expect(expanded).toBeGreaterThan(50);
    expect(expanded).toBeLessThanOrEqual(240);

    const capped = estimateAutoRowHeight(
      [Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')],
      [],
      [0],
      { defaultHeight: 28, fontSize: 13, maxHeight: 160 },
    );
    expect(capped).toBe(160);
  });

  it('formats numeric cell values with Excel-compatible numfmt patterns', () => {
    expect(formatCellValue('1234', '#,##0')).toBe('1,234');
    expect(formatCellValue('42', '0,000')).toBe('0,042');
    expect(formatCellValue('1234.5', '#,##0.00')).toBe('1,234.50');
    expect(formatCellValue('0.123', '0.0%')).toBe('12.3%');
    expect(formatCellValue('96849', '¥#,##0')).toBe('¥96,849');
    expect(formatCellValue('hello', '#,##0')).toBe('hello');
    expect(formatCellValue('', '#,##0')).toBe('');
    expect(isValidNumberFormat('#,##0')).toBe(true);
    expect(isValidNumberFormat('0,000')).toBe(true);

    // Date & time formatting (English / ISO / Japanese)
    expect(formatCellValue('2026-06-10', 'yyyy/mm/dd')).toBe('2026/06/10');
    expect(formatCellValue('2026-06-10', 'mm/dd/yyyy')).toBe('06/10/2026');
    expect(formatCellValue('2026-06-10', 'mmm d, yyyy')).toBe('Jun 10, 2026');
    expect(formatCellValue('2026-06-10', 'yyyy年m月d日')).toBe('2026年6月10日');
    expect(formatCellValue('2026-11-26 14:30:05', 'hh:mm:ss')).toBe('14:30:05');
    expect(formatCellValue('2026年6月10日', 'yyyy-mm-dd')).toBe('2026-06-10');
    expect(formatCellValue('06/10/2026', 'yyyy-mm-dd')).toBe('2026-06-10');
    expect(formatCellValue('not-a-date', 'yyyy/mm/dd')).toBe('not-a-date');
  });

  it('treats deleting a non-existent nested path in patchMetaJsonc as a safe no-op', () => {
    const initial = '{\n  "version": "0.1"\n}\n';
    const afterNoOp = patchMetaJsonc(initial, ['columns', 'amount', 'style'], undefined);
    expect(afterNoOp).toBe(initial);
    const afterAlign = patchMetaJsonc(afterNoOp, ['columns', 'amount', 'align'], 'right');
    const parsed = parseMetaJsonc(afterAlign);
    expect(parsed.columns?.amount?.align).toBe('right');
  });
});
