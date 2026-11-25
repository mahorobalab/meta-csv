import type { SortSpec } from '@meta-csv/schema';

/**
 * Build a view-row-to-data-row mapping without mutating the underlying CSV rows.
 */
export function buildSortedRowIndices(
  rows: string[][],
  columnKeys: string[],
  sortSpecs: SortSpec[] | undefined,
): Int32Array {
  const count = rows.length;
  const indices = new Int32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;

  if (!sortSpecs || sortSpecs.length === 0) {
    return indices;
  }

  const resolvedSpecs = sortSpecs
    .map((spec) => ({
      colIdx: columnKeys.indexOf(spec.column),
      dir: spec.direction === 'desc' ? -1 : 1,
    }))
    .filter((s) => s.colIdx !== -1);

  if (resolvedSpecs.length === 0) {
    return indices;
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const arr = Array.from(indices);
  arr.sort((a, b) => {
    const rowA = rows[a]!;
    const rowB = rows[b]!;
    for (const spec of resolvedSpecs) {
      const va = rowA[spec.colIdx] ?? '';
      const vb = rowB[spec.colIdx] ?? '';
      if (va === vb) continue;
      return collator.compare(va, vb) * spec.dir;
    }
    return a - b;
  });

  return Int32Array.from(arr);
}

export interface SearchMatch {
  viewRow: number;
  dataRow: number;
  col: number;
}

export function searchVisibleRows(
  rows: string[][],
  viewIndices: Int32Array,
  query: string,
  maxMatches = 5000,
): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: SearchMatch[] = [];
  for (let v = 0; v < viewIndices.length; v++) {
    const dataRow = viewIndices[v]!;
    const row = rows[dataRow];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.toLowerCase().includes(needle)) {
        matches.push({ viewRow: v, dataRow, col: c });
        if (matches.length >= maxMatches) return matches;
      }
    }
  }
  return matches;
}
