import { describe, expect, it } from 'vitest';
import {
  UndoRedoHistory,
  buildSortedRowIndices,
  createStyleResolverContext,
  parseCsvBytes,
  parseMetaJsonc,
  patchMetaJsonc,
  resolveCellStyle,
  serializeCsv,
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
        "1:1": { "color": "#f00" }
      }
    }`);

    const ctx = createStyleResolverContext(meta, ['0', '1', '2']);
    const style = resolveCellStyle(ctx, 1, 1, ['A-1', 'AppA', 'Note']);
    expect(style).toEqual({
      bold: true,
      backgroundColor: '#0f0',
      italic: true,
      color: '#f00',
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
});
