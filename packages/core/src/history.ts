export interface CellChange {
  dataRow: number;
  col: number;
  before: string;
  after: string;
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
    };

export class UndoRedoHistory {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 200) {
    this.maxDepth = maxDepth;
  }

  push(command: EditCommand): void {
    if (command.type === 'editCells' && command.changes.length === 0) return;
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(rows: string[][]): EditCommand | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;

    if (cmd.type === 'editCells') {
      for (let i = cmd.changes.length - 1; i >= 0; i--) {
        const ch = cmd.changes[i]!;
        const row = rows[ch.dataRow];
        if (row) row[ch.col] = ch.before;
      }
    } else if (cmd.type === 'insertRow') {
      rows.splice(cmd.index, 1);
    } else if (cmd.type === 'deleteRow') {
      rows.splice(cmd.index, 0, [...cmd.row]);
    }

    this.redoStack.push(cmd);
    return cmd;
  }

  redo(rows: string[][]): EditCommand | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;

    if (cmd.type === 'editCells') {
      for (const ch of cmd.changes) {
        const row = rows[ch.dataRow];
        if (row) row[ch.col] = ch.after;
      }
    } else if (cmd.type === 'insertRow') {
      rows.splice(cmd.index, 0, [...cmd.row]);
    } else if (cmd.type === 'deleteRow') {
      rows.splice(cmd.index, 1);
    }

    this.undoStack.push(cmd);
    return cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
