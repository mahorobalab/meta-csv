import { describe, expect, it } from 'vitest';
import { computeTableCellDiff } from '../cellDiff';

describe('computeTableCellDiff', () => {
  it('matches rows by primary key (first column) and detects cell, row, and column diffs', () => {
    const before = {
      columnKeys: ['id', 'name', 'status', 'legacy'],
      rows: [
        ['101', 'Alpha', 'draft', 'x'],
        ['102', 'Beta', 'open', 'y'],
        ['103', 'Gamma', 'closed', 'z'],
      ],
    };
    const after = {
      // Column order shifted, 'legacy' removed, 'owner' added; rows reordered, 102 removed, 104 added
      columnKeys: ['id', 'status', 'name', 'owner'],
      rows: [
        ['103', 'closed', 'Gamma', 'ken'],
        ['101', 'published', 'Alpha', 'aki'],
        ['104', 'new', 'Delta', 'mika'],
      ],
    };

    const diff = computeTableCellDiff(before, after);
    expect(diff.matchStrategy).toBe('primaryKey');
    expect(diff.primaryKeyColumn).toBe('id');
    expect(diff.addedColumns).toEqual(['owner']);
    expect(diff.removedColumns).toEqual(['legacy']);
    expect(diff.removedRows.map((r) => r.rowKey)).toEqual(['102']);
    expect(diff.addedRows.map((r) => r.rowKey)).toEqual(['104']);
    expect(diff.cellChanges).toEqual([
      {
        rowKey: '101',
        beforeRowIndex: 0,
        afterRowIndex: 1,
        colKey: 'status',
        before: 'draft',
        after: 'published',
      },
    ]);
    expect(diff.summary).toEqual({
      changedCells: 1,
      addedRows: 1,
      removedRows: 1,
      addedColumns: 1,
      removedColumns: 1,
    });
    expect(diff.truncated).toBe(false);
  });

  it('falls back to rowIndex matching when first column has duplicate or empty keys', () => {
    const before = {
      columnKeys: ['level', 'message'],
      rows: [
        ['INFO', 'boot'],
        ['INFO', 'ready'],
        ['WARN', 'slow'],
      ],
    };
    const after = {
      columnKeys: ['level', 'message'],
      rows: [
        ['INFO', 'boot'],
        ['ERROR', 'crashed'],
        ['WARN', 'slow'],
        ['INFO', 'restarted'],
      ],
    };

    const diff = computeTableCellDiff(before, after);
    expect(diff.matchStrategy).toBe('rowIndex');
    expect(diff.primaryKeyColumn).toBeUndefined();
    expect(diff.cellChanges).toEqual([
      {
        rowKey: '#2',
        beforeRowIndex: 1,
        afterRowIndex: 1,
        colKey: 'level',
        before: 'INFO',
        after: 'ERROR',
      },
      {
        rowKey: '#2',
        beforeRowIndex: 1,
        afterRowIndex: 1,
        colKey: 'message',
        before: 'ready',
        after: 'crashed',
      },
    ]);
    expect(diff.addedRows.map((r) => r.rowKey)).toEqual(['#4']);
    expect(diff.removedRows).toEqual([]);
  });

  it('supports explicit primaryKeyColKey and enforces maxChanges truncation', () => {
    const before = {
      columnKeys: ['seq', 'code', 'val'],
      rows: [
        ['dup', 'K1', '1'],
        ['dup', 'K2', '2'],
        ['dup', 'K3', '3'],
      ],
    };
    const after = {
      columnKeys: ['seq', 'code', 'val'],
      rows: [
        ['dup', 'K1', '10'],
        ['dup', 'K2', '20'],
        ['dup', 'K3', '30'],
      ],
    };

    const diff = computeTableCellDiff(before, after, {
      primaryKeyColKey: 'code',
      maxChanges: 2,
    });
    expect(diff.matchStrategy).toBe('primaryKey');
    expect(diff.primaryKeyColumn).toBe('code');
    expect(diff.cellChanges.length).toBe(2);
    expect(diff.truncated).toBe(true);
  });
});
