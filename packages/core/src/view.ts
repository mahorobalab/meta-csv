import type { SortSpec } from '@meta-csv/schema';

function isNumericColumn(rows: string[][], colIdx: number): boolean {
  const limit = Math.min(rows.length, 64);
  let seen = 0;
  for (let i = 0; i < limit; i++) {
    const raw = rows[i]?.[colIdx];
    if (!raw || raw.trim().length === 0) continue;
    const n = Number(raw);
    if (Number.isNaN(n)) return false;
    seen++;
  }
  return seen > 0;
}

/**
 * Build a view-row-to-data-row mapping without mutating the underlying CSV rows.
 * Uses fast primitive/numeric comparators for large datasets (50k+ rows) and
 * Intl.Collator natural sort for smaller datasets.
 */
export function buildSortedRowIndices(
  rows: string[][],
  columnKeys: string[],
  sortSpecs: SortSpec[] | undefined,
): Int32Array {
  const count = rows.length;
  const indices = new Int32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;

  if (!sortSpecs || sortSpecs.length === 0 || count <= 1) {
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

  // Fast path for large datasets (50k+ rows): avoid Intl.Collator overhead
  if (count > 50_000) {
    const primary = resolvedSpecs[0]!;
    const numeric = isNumericColumn(rows, primary.colIdx);

    if (numeric && resolvedSpecs.length === 1) {
      const nums = new Float64Array(count);
      for (let i = 0; i < count; i++) {
        const raw = rows[i]?.[primary.colIdx];
        nums[i] = raw && raw.length > 0 ? Number(raw) : Number.POSITIVE_INFINITY;
      }
      indices.sort((a, b) => {
        const diff = nums[a]! - nums[b]!;
        return diff !== 0 ? diff * primary.dir : a - b;
      });
      return indices;
    }

    indices.sort((a, b) => {
      const rowA = rows[a]!;
      const rowB = rows[b]!;
      for (let s = 0; s < resolvedSpecs.length; s++) {
        const spec = resolvedSpecs[s]!;
        const va = rowA[spec.colIdx] ?? '';
        const vb = rowB[spec.colIdx] ?? '';
        if (va === vb) continue;
        return (va < vb ? -1 : 1) * spec.dir;
      }
      return a - b;
    });
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
