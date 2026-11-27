export interface TabularSnapshotData {
  columnKeys: string[];
  rows: string[][];
}

export interface CellDiffOptions {
  /** Explicit primary key column index (default: 0, i.e. first column) */
  primaryKeyColIndex?: number;
  /** Explicit primary key column key name (takes precedence over primaryKeyColIndex if found in both tables) */
  primaryKeyColKey?: string;
  /** Maximum number of cell/row diff items to collect before truncating (default: 500) */
  maxChanges?: number;
}

export interface CellDiffItem {
  rowKey: string;
  beforeRowIndex: number;
  afterRowIndex: number;
  colKey: string;
  before: string;
  after: string;
}

export interface RowDiffItem {
  rowKey: string;
  rowIndex: number;
  values: Record<string, string>;
}

export interface TableCellDiffResult {
  matchStrategy: 'primaryKey' | 'rowIndex';
  primaryKeyColumn?: string;
  addedColumns: string[];
  removedColumns: string[];
  addedRows: RowDiffItem[];
  removedRows: RowDiffItem[];
  cellChanges: CellDiffItem[];
  truncated: boolean;
  summary: {
    changedCells: number;
    addedRows: number;
    removedRows: number;
    addedColumns: number;
    removedColumns: number;
  };
}

function buildRowObject(columnKeys: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let c = 0; c < columnKeys.length; c++) {
    obj[columnKeys[c]!] = row[c] ?? '';
  }
  return obj;
}

function buildUniqueKeyMap(rows: string[][], colIdx: number): Map<string, number> | null {
  const map = new Map<string, number>();
  for (let r = 0; r < rows.length; r++) {
    const raw = (rows[r]?.[colIdx] ?? '').trim();
    if (!raw || map.has(raw)) {
      return null;
    }
    map.set(raw, r);
  }
  return map;
}

/**
 * Computes a cell-level diff between two tabular snapshots.
 * - Columns are matched by columnKeys.
 * - Rows are matched by the primary key column (default: first column) when unique and non-empty
 *   in both snapshots; otherwise automatically falls back to 0-based row index matching.
 */
export function computeTableCellDiff(
  before: TabularSnapshotData,
  after: TabularSnapshotData,
  options: CellDiffOptions = {},
): TableCellDiffResult {
  const maxChanges = options.maxChanges ?? 500;

  const beforeColMap = new Map<string, number>();
  before.columnKeys.forEach((k, i) => beforeColMap.set(k, i));

  const afterColMap = new Map<string, number>();
  after.columnKeys.forEach((k, i) => afterColMap.set(k, i));

  const addedColumns = after.columnKeys.filter((k) => !beforeColMap.has(k));
  const removedColumns = before.columnKeys.filter((k) => !afterColMap.has(k));
  const sharedColumns = after.columnKeys.filter((k) => beforeColMap.has(k));

  // Determine candidate primary key column present in both snapshots
  let pkColKey: string | undefined;
  if (
    options.primaryKeyColKey &&
    beforeColMap.has(options.primaryKeyColKey) &&
    afterColMap.has(options.primaryKeyColKey)
  ) {
    pkColKey = options.primaryKeyColKey;
  } else {
    const candidateIdx = options.primaryKeyColIndex ?? 0;
    const candidateKey = before.columnKeys[candidateIdx];
    if (candidateKey !== undefined && afterColMap.has(candidateKey)) {
      pkColKey = candidateKey;
    }
  }

  let beforeKeyMap: Map<string, number> | null = null;
  let afterKeyMap: Map<string, number> | null = null;
  if (pkColKey !== undefined && (before.rows.length > 0 || after.rows.length > 0)) {
    const bIdx = beforeColMap.get(pkColKey)!;
    const aIdx = afterColMap.get(pkColKey)!;
    beforeKeyMap = buildUniqueKeyMap(before.rows, bIdx);
    if (beforeKeyMap) {
      afterKeyMap = buildUniqueKeyMap(after.rows, aIdx);
    }
  }

  const usePrimaryKey = beforeKeyMap !== null && afterKeyMap !== null && pkColKey !== undefined;

  const addedRows: RowDiffItem[] = [];
  const removedRows: RowDiffItem[] = [];
  const cellChanges: CellDiffItem[] = [];
  let truncated = false;
  let totalDiffItems = 0;

  const canPush = (): boolean => {
    if (totalDiffItems >= maxChanges) {
      truncated = true;
      return false;
    }
    return true;
  };

  if (usePrimaryKey) {
    // Removed rows (in before, not in after)
    for (const [key, bRowIdx] of beforeKeyMap!) {
      if (!afterKeyMap!.has(key)) {
        if (!canPush()) break;
        removedRows.push({
          rowKey: key,
          rowIndex: bRowIdx,
          values: buildRowObject(before.columnKeys, before.rows[bRowIdx] ?? []),
        });
        totalDiffItems++;
      }
    }

    // Added rows and modified cells
    for (const [key, aRowIdx] of afterKeyMap!) {
      const bRowIdx = beforeKeyMap!.get(key);
      if (bRowIdx === undefined) {
        if (!canPush()) break;
        addedRows.push({
          rowKey: key,
          rowIndex: aRowIdx,
          values: buildRowObject(after.columnKeys, after.rows[aRowIdx] ?? []),
        });
        totalDiffItems++;
        continue;
      }

      const bRow = before.rows[bRowIdx] ?? [];
      const aRow = after.rows[aRowIdx] ?? [];
      for (const colKey of sharedColumns) {
        const bVal = bRow[beforeColMap.get(colKey)!] ?? '';
        const aVal = aRow[afterColMap.get(colKey)!] ?? '';
        if (bVal !== aVal) {
          if (!canPush()) break;
          cellChanges.push({
            rowKey: key,
            beforeRowIndex: bRowIdx,
            afterRowIndex: aRowIdx,
            colKey,
            before: bVal,
            after: aVal,
          });
          totalDiffItems++;
        }
      }
      if (truncated) break;
    }
  } else {
    // Fallback: 0-based row index matching
    const minLen = Math.min(before.rows.length, after.rows.length);
    for (let r = 0; r < minLen; r++) {
      const bRow = before.rows[r] ?? [];
      const aRow = after.rows[r] ?? [];
      for (const colKey of sharedColumns) {
        const bVal = bRow[beforeColMap.get(colKey)!] ?? '';
        const aVal = aRow[afterColMap.get(colKey)!] ?? '';
        if (bVal !== aVal) {
          if (!canPush()) break;
          cellChanges.push({
            rowKey: `#${r + 1}`,
            beforeRowIndex: r,
            afterRowIndex: r,
            colKey,
            before: bVal,
            after: aVal,
          });
          totalDiffItems++;
        }
      }
      if (truncated) break;
    }

    if (!truncated && after.rows.length > before.rows.length) {
      for (let r = before.rows.length; r < after.rows.length; r++) {
        if (!canPush()) break;
        addedRows.push({
          rowKey: `#${r + 1}`,
          rowIndex: r,
          values: buildRowObject(after.columnKeys, after.rows[r] ?? []),
        });
        totalDiffItems++;
      }
    } else if (!truncated && before.rows.length > after.rows.length) {
      for (let r = after.rows.length; r < before.rows.length; r++) {
        if (!canPush()) break;
        removedRows.push({
          rowKey: `#${r + 1}`,
          rowIndex: r,
          values: buildRowObject(before.columnKeys, before.rows[r] ?? []),
        });
        totalDiffItems++;
      }
    }
  }

  return {
    matchStrategy: usePrimaryKey ? 'primaryKey' : 'rowIndex',
    primaryKeyColumn: usePrimaryKey ? pkColKey : undefined,
    addedColumns,
    removedColumns,
    addedRows,
    removedRows,
    cellChanges,
    truncated,
    summary: {
      changedCells: cellChanges.length,
      addedRows: addedRows.length,
      removedRows: removedRows.length,
      addedColumns: addedColumns.length,
      removedColumns: removedColumns.length,
    },
  };
}
