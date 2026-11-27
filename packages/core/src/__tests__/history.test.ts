import { describe, expect, it } from 'vitest';
import { UndoRedoHistory, type UndoApplyTarget } from '../history';

function createDoc() {
  const state = {
    rows: [
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ],
    headers: ['A', 'B', 'C'],
    columnKeys: ['A', 'B', 'C'],
    autoWidths: [100, 120, 140],
    metaText: '{"version":"1"}',
  };

  const target: UndoApplyTarget = {
    rows: state.rows,
    headers: state.headers,
    columnKeys: state.columnKeys,
    autoWidths: state.autoWidths,
    onColumnsChanged: (next) => {
      state.headers = next.headers;
      state.columnKeys = next.columnKeys;
      state.autoWidths = next.autoWidths;
      target.headers = state.headers;
      target.columnKeys = state.columnKeys;
      target.autoWidths = state.autoWidths;
    },
    onMetaTextChange: (nextMeta) => {
      state.metaText = nextMeta;
    },
  };

  return { state, target };
}

describe('UndoRedoHistory (full-set Layer 1)', () => {
  it('handles insertRows and deleteRows (multi-row non-contiguous)', () => {
    const { state, target } = createDoc();
    const history = new UndoRedoHistory();

    // Insert 2 rows at index 1
    const inserted = [
      ['x1', 'y1', 'z1'],
      ['x2', 'y2', 'z2'],
    ];
    state.rows.splice(1, 0, ...inserted.map((r) => [...r]));
    history.push({ type: 'insertRows', index: 1, rows: inserted }, 'Insert 2 rows');
    expect(state.rows.length).toBe(5);

    // Delete non-contiguous rows 0 and 3 (after insertion: ['a1',...] and ['a2',...])
    const del0 = [...state.rows[0]!];
    const del3 = [...state.rows[3]!];
    state.rows.splice(3, 1);
    state.rows.splice(0, 1);
    history.push(
      {
        type: 'deleteRows',
        rows: [
          { index: 0, row: del0 },
          { index: 3, row: del3 },
        ],
      },
      'Delete 2 rows',
    );
    expect(state.rows).toEqual([
      ['x1', 'y1', 'z1'],
      ['x2', 'y2', 'z2'],
      ['a3', 'b3', 'c3'],
    ]);

    // Undo deleteRows
    history.undo(target);
    expect(state.rows.length).toBe(5);
    expect(state.rows[0]).toEqual(['a1', 'b1', 'c1']);
    expect(state.rows[3]).toEqual(['a2', 'b2', 'c2']);

    // Undo insertRows
    history.undo(target);
    expect(state.rows).toEqual([
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ]);

    // Redo both
    history.redo(target);
    history.redo(target);
    expect(state.rows).toEqual([
      ['x1', 'y1', 'z1'],
      ['x2', 'y2', 'z2'],
      ['a3', 'b3', 'c3'],
    ]);
  });

  it('handles insertCols, deleteCols, renameCol, and shiftCols', () => {
    const { state, target } = createDoc();
    const history = new UndoRedoHistory();

    // 1. insertCols at index 1
    state.headers.splice(1, 0, 'NEW');
    state.columnKeys.splice(1, 0, 'NEW');
    state.autoWidths.splice(1, 0, 150);
    for (let r = 0; r < state.rows.length; r++) {
      state.rows[r]!.splice(1, 0, `n${r + 1}`);
    }
    history.push(
      {
        type: 'insertCols',
        index: 1,
        headers: ['NEW'],
        keys: ['NEW'],
        widths: [150],
        values: [['n1'], ['n2'], ['n3']],
      },
      'Insert column NEW',
    );

    // 2. renameCol index 1 -> RENAMED
    state.headers[1] = 'RENAMED';
    state.columnKeys[1] = 'RENAMED';
    history.push(
      {
        type: 'renameCol',
        colIndex: 1,
        beforeHeader: 'NEW',
        afterHeader: 'RENAMED',
        beforeKey: 'NEW',
        afterKey: 'RENAMED',
      },
      'Rename column',
    );

    // 3. shiftCols [1..2] right (+1) -> ['A', 'C', 'RENAMED', 'B']
    // Simulate shift right
    const moveIdx = 3;
    const h = state.headers.splice(moveIdx, 1)[0]!;
    state.headers.splice(1, 0, h);
    const k = state.columnKeys.splice(moveIdx, 1)[0]!;
    state.columnKeys.splice(1, 0, k);
    const w = state.autoWidths.splice(moveIdx, 1)[0]!;
    state.autoWidths.splice(1, 0, w);
    for (const row of state.rows) {
      const v = row.splice(moveIdx, 1)[0]!;
      row.splice(1, 0, v);
    }
    history.push(
      { type: 'shiftCols', startCol: 1, endCol: 2, direction: 1, hasHeader: true },
      'Shift columns right',
    );
    expect(state.headers).toEqual(['A', 'C', 'RENAMED', 'B']);
    expect(state.rows[0]).toEqual(['a1', 'c1', 'n1', 'b1']);

    // 4. deleteCols index 1 ('C')
    const colValues = state.rows.map((r) => r[1]!);
    state.headers.splice(1, 1);
    state.columnKeys.splice(1, 1);
    state.autoWidths.splice(1, 1);
    for (const row of state.rows) row.splice(1, 1);
    history.push(
      {
        type: 'deleteCols',
        cols: [{ index: 1, header: 'C', key: 'C', width: 140, values: colValues }],
      },
      'Delete column C',
    );
    expect(state.headers).toEqual(['A', 'RENAMED', 'B']);

    // Jump all the way back to initial state (cursor 0) in one call
    const jumpBack = history.jumpTo(0, target);
    expect(jumpBack.applied.length).toBe(4);
    expect(jumpBack.touchedData).toBe(true);
    expect(jumpBack.columnsChanged).toBe(true);
    expect(state.headers).toEqual(['A', 'B', 'C']);
    expect(state.columnKeys).toEqual(['A', 'B', 'C']);
    expect(state.autoWidths).toEqual([100, 120, 140]);
    expect(state.rows).toEqual([
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ]);

    // Jump forward to cursor 4
    const jumpFwd = history.jumpTo(4, target);
    expect(jumpFwd.applied.length).toBe(4);
    expect(state.headers).toEqual(['A', 'RENAMED', 'B']);
    expect(state.rows[0]).toEqual(['a1', 'n1', 'b1']);
  });

  it('handles metaChange and composite commands cleanly with cursor & entries', () => {
    const { state, target } = createDoc();
    const history = new UndoRedoHistory();

    // Meta-only change
    const meta1 = '{"version":"1","view":{"markers":[{"row":0,"color":"amber"}]}}';
    state.metaText = meta1;
    history.push(
      { type: 'metaChange', beforeMetaText: '{"version":"1"}', afterMetaText: meta1 },
      'Add marker',
    );
    expect(history.peekUndo()?.touchesData).toBe(false);
    expect(history.peekUndo()?.touchesMeta).toBe(true);

    // Composite data + meta change
    const meta2 = '{"version":"1","cells":{"0:A":{"bold":true}}}';
    state.rows[0]![0] = 'UPDATED';
    state.metaText = meta2;
    history.push(
      {
        type: 'composite',
        steps: [
          { type: 'editCells', changes: [{ dataRow: 0, col: 0, before: 'a1', after: 'UPDATED' }] },
          { type: 'metaChange', beforeMetaText: meta1, afterMetaText: meta2 },
        ],
      },
      'Paste cell with style',
    );

    const entries = history.getEntries();
    expect(entries.length).toBe(2);
    expect(entries[0]?.label).toBe('Add marker');
    expect(entries[1]?.label).toBe('Paste cell with style');
    expect(history.getCursor()).toBe(2);

    // Undo composite -> both cell and meta revert together
    const undoRes = history.undoEntry(target);
    expect(undoRes?.touchesData).toBe(true);
    expect(undoRes?.touchesMeta).toBe(true);
    expect(state.rows[0]![0]).toBe('a1');
    expect(state.metaText).toBe(meta1);

    // Undo meta-only
    const undoMeta = history.undoEntry(target);
    expect(undoMeta?.touchesData).toBe(false);
    expect(undoMeta?.touchesMeta).toBe(true);
    expect(state.metaText).toBe('{"version":"1"}');

    // Redo via jumpTo(2)
    const res = history.jumpTo(2, target);
    expect(res.touchedData).toBe(true);
    expect(res.touchedMeta).toBe(true);
    expect(state.rows[0]![0]).toBe('UPDATED');
    expect(state.metaText).toBe(meta2);
  });

  it('ignores no-op commands and truncates redo branch on new push', () => {
    const { state, target } = createDoc();
    const history = new UndoRedoHistory();

    expect(history.push({ type: 'editCells', changes: [] })).toBeNull();
    expect(
      history.push({ type: 'metaChange', beforeMetaText: 'same', afterMetaText: 'same' }),
    ).toBeNull();

    state.rows[0]![0] = 'v1';
    history.push(
      { type: 'editCells', changes: [{ dataRow: 0, col: 0, before: 'a1', after: 'v1' }] },
      'v1',
    );
    state.rows[0]![0] = 'v2';
    history.push(
      { type: 'editCells', changes: [{ dataRow: 0, col: 0, before: 'v1', after: 'v2' }] },
      'v2',
    );

    history.jumpTo(1, target);
    expect(state.rows[0]![0]).toBe('v1');
    expect(history.canRedo()).toBe(true);

    // New edit drops v2 from redo stack
    state.rows[0]![0] = 'v3';
    history.push(
      { type: 'editCells', changes: [{ dataRow: 0, col: 0, before: 'v1', after: 'v3' }] },
      'v3',
    );
    expect(history.canRedo()).toBe(false);
    expect(history.getEntries().map((e) => e.label)).toEqual(['v1', 'v3']);
  });
});
