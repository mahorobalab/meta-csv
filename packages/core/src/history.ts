export interface CellChange {
  dataRow: number;
  col: number;
  before: string;
  after: string;
}

export interface RowSnapshot {
  /** 0-based index in rows array (sorted ascending when multiple) */
  index: number;
  row: string[];
}

export interface ColumnSnapshot {
  /** 0-based index in columns (sorted ascending when multiple) */
  index: number;
  header: string;
  key: string;
  width: number;
  /** Column values across all rows (length === rows.length) */
  values: string[];
}

export type EditCommand =
  | {
      type: 'editCells';
      changes: CellChange[];
    }
  | {
      type: 'insertRow';
      index: number;
      row: string[];
    }
  | {
      type: 'deleteRow';
      index: number;
      row: string[];
    }
  | {
      type: 'insertRows';
      /** Contiguous block insertion starting at index */
      index: number;
      rows: string[][];
    }
  | {
      type: 'deleteRows';
      /** Deleted rows sorted by ascending original index */
      rows: RowSnapshot[];
    }
  | {
      type: 'insertCols';
      /** Contiguous column block insertion starting at index */
      index: number;
      headers: string[];
      keys: string[];
      widths: number[];
      /** Optional per-row values for each inserted column: values[r][c] */
      values?: string[][];
      /** True when CSV has no header and keys should be re-indexed '0'..'N-1' */
      reindexKeys?: boolean;
    }
  | {
      type: 'deleteCols';
      /** Deleted columns sorted by ascending original index */
      cols: ColumnSnapshot[];
      reindexKeys?: boolean;
    }
  | {
      type: 'renameCol';
      colIndex: number;
      beforeHeader: string;
      afterHeader: string;
      beforeKey: string;
      afterKey: string;
    }
  | {
      type: 'shiftCols';
      startCol: number;
      endCol: number;
      direction: -1 | 1;
      hasHeader: boolean;
    }
  | {
      type: 'metaChange';
      beforeMetaText: string;
      afterMetaText: string;
    }
  | {
      type: 'composite';
      steps: EditCommand[];
    };

export interface UndoApplyTarget {
  rows: string[][];
  headers?: string[];
  columnKeys?: string[];
  autoWidths?: number[];
  onMetaTextChange?: (nextMetaText: string) => void;
  onColumnsChanged?: (next: {
    headers: string[];
    columnKeys: string[];
    autoWidths: number[];
  }) => void;
}

export interface HistoryEntry {
  id: number;
  label: string;
  timestamp: number;
  command: EditCommand;
  touchesData: boolean;
  touchesMeta: boolean;
}

export interface HistoryEntrySummary {
  id: number;
  /** 1-based cursor position (0 = initial state before any edits) */
  index: number;
  label: string;
  timestamp: number;
  touchesData: boolean;
  touchesMeta: boolean;
}

export interface HistoryApplyResult {
  applied: HistoryEntry[];
  touchedData: boolean;
  touchedMeta: boolean;
  columnsChanged: boolean;
}

function classifyCommand(cmd: EditCommand): { touchesData: boolean; touchesMeta: boolean } {
  switch (cmd.type) {
    case 'metaChange':
      return { touchesData: false, touchesMeta: true };
    case 'composite': {
      let touchesData = false;
      let touchesMeta = false;
      for (const step of cmd.steps) {
        const sub = classifyCommand(step);
        if (sub.touchesData) touchesData = true;
        if (sub.touchesMeta) touchesMeta = true;
      }
      return { touchesData, touchesMeta };
    }
    default:
      return { touchesData: true, touchesMeta: false };
  }
}

function isNoOpCommand(cmd: EditCommand): boolean {
  switch (cmd.type) {
    case 'editCells':
      return cmd.changes.length === 0;
    case 'insertRows':
      return cmd.rows.length === 0;
    case 'deleteRows':
      return cmd.rows.length === 0;
    case 'insertCols':
      return cmd.headers.length === 0;
    case 'deleteCols':
      return cmd.cols.length === 0;
    case 'metaChange':
      return cmd.beforeMetaText === cmd.afterMetaText;
    case 'composite':
      return cmd.steps.length === 0 || cmd.steps.every(isNoOpCommand);
    default:
      return false;
  }
}

function defaultLabelForCommand(cmd: EditCommand): string {
  switch (cmd.type) {
    case 'editCells':
      return cmd.changes.length === 1 ? 'Edit cell' : `Edit ${cmd.changes.length} cells`;
    case 'insertRow':
      return 'Insert row';
    case 'deleteRow':
      return 'Delete row';
    case 'insertRows':
      return cmd.rows.length === 1 ? 'Insert row' : `Insert ${cmd.rows.length} rows`;
    case 'deleteRows':
      return cmd.rows.length === 1 ? 'Delete row' : `Delete ${cmd.rows.length} rows`;
    case 'insertCols':
      return cmd.headers.length === 1 ? 'Insert column' : `Insert ${cmd.headers.length} columns`;
    case 'deleteCols':
      return cmd.cols.length === 1 ? 'Delete column' : `Delete ${cmd.cols.length} columns`;
    case 'renameCol':
      return 'Rename column';
    case 'shiftCols':
      return cmd.direction < 0 ? 'Move column(s) left' : 'Move column(s) right';
    case 'metaChange':
      return 'Update metadata';
    case 'composite':
      return 'Edit document';
  }
}

function rotateBlockInPlace<T>(
  arr: T[],
  startIdx: number,
  endIdx: number,
  direction: -1 | 1,
): void {
  if (direction === -1) {
    if (startIdx <= 0 || endIdx >= arr.length) return;
    const [moved] = arr.splice(startIdx - 1, 1);
    if (moved !== undefined) arr.splice(endIdx, 0, moved);
  } else {
    if (startIdx < 0 || endIdx >= arr.length - 1) return;
    const [moved] = arr.splice(endIdx + 1, 1);
    if (moved !== undefined) arr.splice(startIdx, 0, moved);
  }
}

function reindexColumnKeysInPlace(keys: string[]): void {
  for (let i = 0; i < keys.length; i++) {
    keys[i] = String(i);
  }
}

interface ApplyContext {
  rows: string[][];
  headers: string[] | undefined;
  columnKeys: string[] | undefined;
  autoWidths: number[] | undefined;
  columnsChanged: boolean;
  latestMetaText: string | undefined;
}

function applyCommandDirection(
  cmd: EditCommand,
  direction: 'undo' | 'redo',
  ctx: ApplyContext,
): void {
  switch (cmd.type) {
    case 'editCells': {
      if (direction === 'undo') {
        for (let i = cmd.changes.length - 1; i >= 0; i--) {
          const ch = cmd.changes[i]!;
          const row = ctx.rows[ch.dataRow];
          if (row) row[ch.col] = ch.before;
        }
      } else {
        for (const ch of cmd.changes) {
          const row = ctx.rows[ch.dataRow];
          if (row) row[ch.col] = ch.after;
        }
      }
      break;
    }

    case 'insertRow': {
      if (direction === 'undo') {
        ctx.rows.splice(cmd.index, 1);
      } else {
        ctx.rows.splice(cmd.index, 0, [...cmd.row]);
      }
      break;
    }

    case 'deleteRow': {
      if (direction === 'undo') {
        ctx.rows.splice(cmd.index, 0, [...cmd.row]);
      } else {
        ctx.rows.splice(cmd.index, 1);
      }
      break;
    }

    case 'insertRows': {
      if (direction === 'undo') {
        ctx.rows.splice(cmd.index, cmd.rows.length);
      } else {
        const copies = cmd.rows.map((r) => [...r]);
        ctx.rows.splice(cmd.index, 0, ...copies);
      }
      break;
    }

    case 'deleteRows': {
      if (direction === 'undo') {
        // Sorted ascending by original index: inserting in ascending order restores exact positions
        for (const item of cmd.rows) {
          ctx.rows.splice(item.index, 0, [...item.row]);
        }
      } else {
        // Delete in descending order so indices don't shift
        for (let i = cmd.rows.length - 1; i >= 0; i--) {
          ctx.rows.splice(cmd.rows[i]!.index, 1);
        }
      }
      break;
    }

    case 'insertCols': {
      const count = cmd.headers.length;
      if (direction === 'undo') {
        if (ctx.headers) ctx.headers.splice(cmd.index, count);
        if (ctx.columnKeys) {
          ctx.columnKeys.splice(cmd.index, count);
          if (cmd.reindexKeys) reindexColumnKeysInPlace(ctx.columnKeys);
        }
        if (ctx.autoWidths) ctx.autoWidths.splice(cmd.index, count);
        for (let r = 0; r < ctx.rows.length; r++) {
          ctx.rows[r]!.splice(cmd.index, count);
        }
      } else {
        if (ctx.headers) ctx.headers.splice(cmd.index, 0, ...cmd.headers);
        if (ctx.columnKeys) {
          ctx.columnKeys.splice(cmd.index, 0, ...cmd.keys);
          if (cmd.reindexKeys) reindexColumnKeysInPlace(ctx.columnKeys);
        }
        if (ctx.autoWidths) ctx.autoWidths.splice(cmd.index, 0, ...cmd.widths);
        for (let r = 0; r < ctx.rows.length; r++) {
          const vals = cmd.values?.[r] ?? Array.from({ length: count }, () => '');
          ctx.rows[r]!.splice(cmd.index, 0, ...vals);
        }
      }
      ctx.columnsChanged = true;
      break;
    }

    case 'deleteCols': {
      if (direction === 'undo') {
        for (const col of cmd.cols) {
          if (ctx.headers) ctx.headers.splice(col.index, 0, col.header);
          if (ctx.columnKeys) ctx.columnKeys.splice(col.index, 0, col.key);
          if (ctx.autoWidths) ctx.autoWidths.splice(col.index, 0, col.width);
          for (let r = 0; r < ctx.rows.length; r++) {
            ctx.rows[r]!.splice(col.index, 0, col.values[r] ?? '');
          }
        }
        if (cmd.reindexKeys && ctx.columnKeys) reindexColumnKeysInPlace(ctx.columnKeys);
      } else {
        for (let i = cmd.cols.length - 1; i >= 0; i--) {
          const idx = cmd.cols[i]!.index;
          if (ctx.headers) ctx.headers.splice(idx, 1);
          if (ctx.columnKeys) ctx.columnKeys.splice(idx, 1);
          if (ctx.autoWidths) ctx.autoWidths.splice(idx, 1);
          for (let r = 0; r < ctx.rows.length; r++) {
            ctx.rows[r]!.splice(idx, 1);
          }
        }
        if (cmd.reindexKeys && ctx.columnKeys) reindexColumnKeysInPlace(ctx.columnKeys);
      }
      ctx.columnsChanged = true;
      break;
    }

    case 'renameCol': {
      const nextHeader = direction === 'undo' ? cmd.beforeHeader : cmd.afterHeader;
      const nextKey = direction === 'undo' ? cmd.beforeKey : cmd.afterKey;
      if (ctx.headers && cmd.colIndex < ctx.headers.length) {
        ctx.headers[cmd.colIndex] = nextHeader;
      }
      if (ctx.columnKeys && cmd.colIndex < ctx.columnKeys.length) {
        ctx.columnKeys[cmd.colIndex] = nextKey;
      }
      ctx.columnsChanged = true;
      break;
    }

    case 'shiftCols': {
      const dir: -1 | 1 = direction === 'undo' ? (cmd.direction === -1 ? 1 : -1) : cmd.direction;
      const start = direction === 'undo' ? cmd.startCol + cmd.direction : cmd.startCol;
      const end = direction === 'undo' ? cmd.endCol + cmd.direction : cmd.endCol;
      if (ctx.headers) rotateBlockInPlace(ctx.headers, start, end, dir);
      if (ctx.columnKeys && cmd.hasHeader) {
        rotateBlockInPlace(ctx.columnKeys, start, end, dir);
      }
      if (ctx.autoWidths) rotateBlockInPlace(ctx.autoWidths, start, end, dir);
      for (let r = 0; r < ctx.rows.length; r++) {
        rotateBlockInPlace(ctx.rows[r]!, start, end, dir);
      }
      ctx.columnsChanged = true;
      break;
    }

    case 'metaChange': {
      ctx.latestMetaText = direction === 'undo' ? cmd.beforeMetaText : cmd.afterMetaText;
      break;
    }

    case 'composite': {
      if (direction === 'undo') {
        for (let i = cmd.steps.length - 1; i >= 0; i--) {
          applyCommandDirection(cmd.steps[i]!, 'undo', ctx);
        }
      } else {
        for (const step of cmd.steps) {
          applyCommandDirection(step, 'redo', ctx);
        }
      }
      break;
    }
  }
}

function normalizeTarget(target: string[][] | UndoApplyTarget): UndoApplyTarget {
  if (Array.isArray(target)) {
    return { rows: target };
  }
  return target;
}

export class UndoRedoHistory {
  private entries: HistoryEntry[] = [];
  /** Current position in entries: 0 = initial state, entries.length = latest */
  private cursor = 0;
  private nextId = 1;
  private readonly maxDepth: number;

  constructor(maxDepth = 200) {
    this.maxDepth = maxDepth;
  }

  push(command: EditCommand, label?: string, timestamp = Date.now()): HistoryEntry | null {
    if (isNoOpCommand(command)) return null;
    if (this.cursor < this.entries.length) {
      this.entries.splice(this.cursor);
    }
    const { touchesData, touchesMeta } = classifyCommand(command);
    const entry: HistoryEntry = {
      id: this.nextId++,
      label: label ?? defaultLabelForCommand(command),
      timestamp,
      command,
      touchesData,
      touchesMeta,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxDepth) {
      this.entries.shift();
    }
    this.cursor = this.entries.length;
    return entry;
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.entries.length;
  }

  getCursor(): number {
    return this.cursor;
  }

  getEntries(): HistoryEntrySummary[] {
    return this.entries.map((e, i) => ({
      id: e.id,
      index: i + 1,
      label: e.label,
      timestamp: e.timestamp,
      touchesData: e.touchesData,
      touchesMeta: e.touchesMeta,
    }));
  }

  peekUndo(): HistoryEntrySummary | null {
    if (this.cursor <= 0) return null;
    const e = this.entries[this.cursor - 1]!;
    return {
      id: e.id,
      index: this.cursor,
      label: e.label,
      timestamp: e.timestamp,
      touchesData: e.touchesData,
      touchesMeta: e.touchesMeta,
    };
  }

  peekRedo(): HistoryEntrySummary | null {
    if (this.cursor >= this.entries.length) return null;
    const e = this.entries[this.cursor]!;
    return {
      id: e.id,
      index: this.cursor + 1,
      label: e.label,
      timestamp: e.timestamp,
      touchesData: e.touchesData,
      touchesMeta: e.touchesMeta,
    };
  }

  undo(target: string[][] | UndoApplyTarget): EditCommand | null {
    const entry = this.undoEntry(target);
    return entry ? entry.command : null;
  }

  redo(target: string[][] | UndoApplyTarget): EditCommand | null {
    const entry = this.redoEntry(target);
    return entry ? entry.command : null;
  }

  undoEntry(target: string[][] | UndoApplyTarget): HistoryEntry | null {
    if (this.cursor <= 0) return null;
    const res = this.jumpTo(this.cursor - 1, target);
    return res.applied[0] ?? null;
  }

  redoEntry(target: string[][] | UndoApplyTarget): HistoryEntry | null {
    if (this.cursor >= this.entries.length) return null;
    const res = this.jumpTo(this.cursor + 1, target);
    return res.applied[0] ?? null;
  }

  jumpTo(targetCursor: number, target: string[][] | UndoApplyTarget): HistoryApplyResult {
    const clamped = Math.max(0, Math.min(this.entries.length, Math.trunc(targetCursor)));
    const applied: HistoryEntry[] = [];
    if (clamped === this.cursor) {
      return { applied, touchedData: false, touchedMeta: false, columnsChanged: false };
    }

    const norm = normalizeTarget(target);
    const ctx: ApplyContext = {
      rows: norm.rows,
      headers: norm.headers ? [...norm.headers] : undefined,
      columnKeys: norm.columnKeys ? [...norm.columnKeys] : undefined,
      autoWidths: norm.autoWidths ? [...norm.autoWidths] : undefined,
      columnsChanged: false,
      latestMetaText: undefined,
    };

    let touchedData = false;
    let touchedMeta = false;

    if (clamped < this.cursor) {
      while (this.cursor > clamped) {
        const entry = this.entries[this.cursor - 1]!;
        applyCommandDirection(entry.command, 'undo', ctx);
        this.cursor--;
        applied.push(entry);
        if (entry.touchesData) touchedData = true;
        if (entry.touchesMeta) touchedMeta = true;
      }
    } else {
      while (this.cursor < clamped) {
        const entry = this.entries[this.cursor]!;
        applyCommandDirection(entry.command, 'redo', ctx);
        this.cursor++;
        applied.push(entry);
        if (entry.touchesData) touchedData = true;
        if (entry.touchesMeta) touchedMeta = true;
      }
    }

    if (ctx.columnsChanged && ctx.headers && ctx.columnKeys && ctx.autoWidths) {
      norm.onColumnsChanged?.({
        headers: ctx.headers,
        columnKeys: ctx.columnKeys,
        autoWidths: ctx.autoWidths,
      });
    }
    if (ctx.latestMetaText !== undefined) {
      norm.onMetaTextChange?.(ctx.latestMetaText);
    }

    return {
      applied,
      touchedData,
      touchedMeta,
      columnsChanged: ctx.columnsChanged,
    };
  }

  clear(): void {
    this.entries = [];
    this.cursor = 0;
  }
}
