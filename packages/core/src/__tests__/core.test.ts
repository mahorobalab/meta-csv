import { describe, expect, it } from 'vitest';
import {
  UndoRedoHistory,
  applyViewFilter,
  buildSortedRowIndices,
  computeColumnFacets,
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
});
