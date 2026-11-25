export type FilterTermKind = 'contains' | 'equals' | 'regex' | 'compare';
export type CompareOp = '>' | '>=' | '<' | '<=';

export interface ParsedFilterTerm {
  negated: boolean;
  /** Column index to match against, or null for full-row search */
  colIndex: number | null;
  kind: FilterTermKind;
  value: string;
  lowerValue: string;
  regex?: RegExp;
  compareOp?: CompareOp;
  numericValue?: number;
}

export interface ParsedFilterQuery {
  /** Disjunctive normal form: OR of AND-term groups */
  groups: ParsedFilterTerm[][];
  error?: string;
}

/**
 * Tokenize a Google-like query string respecting quotes and /regex/flags.
 * Examples:
 *   status:blocked -owner:suzuki amount:>50000 /error|timeout/i
 *   status:/^(blocked|review)$/ "exact phrase"
 */
export function tokenizeFilterQuery(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    while (i < len && /\s/.test(input[i]!)) i++;
    if (i >= len) break;

    let token = '';
    let inQuote = false;
    let inRegex = false;

    while (i < len) {
      const ch = input[i]!;
      if (!inQuote && !inRegex && /\s/.test(ch)) {
        break;
      }
      if (ch === '"' && !inRegex) {
        inQuote = !inQuote;
        token += ch;
        i++;
        continue;
      }
      if (ch === '/' && !inQuote) {
        const prev = i > 0 ? input[i - 1] : '';
        if (!inRegex && (token.length === 0 || token === '-' || token.endsWith(':'))) {
          inRegex = true;
          token += ch;
          i++;
          continue;
        }
        if (inRegex && prev !== '\\') {
          inRegex = false;
          token += ch;
          i++;
          // Consume regex flags like i, m
          while (i < len && /[a-z]/i.test(input[i]!)) {
            token += input[i]!;
            i++;
          }
          continue;
        }
      }
      token += ch;
      i++;
    }

    if (token.length > 0) tokens.push(token);
  }

  return tokens;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

function tryParseRegexLiteral(raw: string): { regex: RegExp | null; error?: string } {
  if (!raw.startsWith('/')) return { regex: null };
  const lastSlash = raw.lastIndexOf('/');
  if (lastSlash <= 0) return { regex: null };
  const pattern = raw.slice(1, lastSlash);
  const flags = raw.slice(lastSlash + 1) || 'i';
  try {
    return { regex: new RegExp(pattern, flags) };
  } catch (err) {
    return { regex: null, error: `Invalid regex ${raw}: ${String(err)}` };
  }
}

export function parseFilterQuery(
  query: string,
  columnLookup: Map<string, number>,
): ParsedFilterQuery {
  const trimmed = query.trim();
  if (!trimmed) return { groups: [] };

  const tokens = tokenizeFilterQuery(trimmed);
  const groups: ParsedFilterTerm[][] = [];
  let currentGroup: ParsedFilterTerm[] = [];

  for (let raw of tokens) {
    if (raw === 'OR' || raw === 'or' || raw === '||') {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }

    let negated = false;
    if (raw.startsWith('-') && raw.length > 1) {
      negated = true;
      raw = raw.slice(1);
    }

    let colIndex: number | null = null;
    let expr = raw;

    // Check column prefix: "colName:expr" (skip if raw starts with / or ")
    if (!raw.startsWith('/') && !raw.startsWith('"')) {
      const colonIdx = raw.indexOf(':');
      if (colonIdx > 0) {
        const colName = raw.slice(0, colonIdx);
        const found =
          columnLookup.get(colName) ?? columnLookup.get(colName.toLowerCase());
        if (found !== undefined) {
          colIndex = found;
          expr = raw.slice(colonIdx + 1);
        }
      }
    }

    if (expr.length === 0) continue;

    // 1. Regex literal: /pattern/flags
    if (expr.startsWith('/') && expr.lastIndexOf('/') > 0) {
      const { regex, error } = tryParseRegexLiteral(expr);
      if (error) return { groups: [], error };
      if (regex) {
        currentGroup.push({
          negated,
          colIndex,
          kind: 'regex',
          value: expr,
          lowerValue: expr.toLowerCase(),
          regex,
        });
        continue;
      }
    }

    // 2. Numeric / lexical comparison: >=, <=, >, <
    const cmpMatch = /^(>=|<=|>|<)(.+)$/.exec(expr);
    if (cmpMatch) {
      const compareOp = cmpMatch[1] as CompareOp;
      const rhs = unquote(cmpMatch[2]!);
      const num = Number(rhs);
      currentGroup.push({
        negated,
        colIndex,
        kind: 'compare',
        value: rhs,
        lowerValue: rhs.toLowerCase(),
        compareOp,
        numericValue: Number.isNaN(num) ? undefined : num,
      });
      continue;
    }

    // 3. Exact match: =value
    if (expr.startsWith('=') && expr.length > 1) {
      const val = unquote(expr.slice(1));
      currentGroup.push({
        negated,
        colIndex,
        kind: 'equals',
        value: val,
        lowerValue: val.toLowerCase(),
      });
      continue;
    }

    // 4. Default: case-insensitive substring contains
    const val = unquote(expr);
    currentGroup.push({
      negated,
      colIndex,
      kind: 'contains',
      value: val,
      lowerValue: val.toLowerCase(),
    });
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return { groups };
}

function matchCell(cell: string, term: ParsedFilterTerm): boolean {
  switch (term.kind) {
    case 'contains':
      return cell.toLowerCase().includes(term.lowerValue);
    case 'equals':
      return cell.toLowerCase() === term.lowerValue;
    case 'regex':
      return term.regex ? term.regex.test(cell) : false;
    case 'compare': {
      if (term.numericValue !== undefined) {
        if (cell.length === 0) return false;
        const n = Number(cell);
        if (Number.isNaN(n)) return false;
        switch (term.compareOp) {
          case '>':
            return n > term.numericValue;
          case '>=':
            return n >= term.numericValue;
          case '<':
            return n < term.numericValue;
          case '<=':
            return n <= term.numericValue;
        }
      }
      // Fallback string comparison (works great for ISO dates like 2026-05-01)
      switch (term.compareOp) {
        case '>':
          return cell > term.value;
        case '>=':
          return cell >= term.value;
        case '<':
          return cell < term.value;
        case '<=':
          return cell <= term.value;
      }
    }
  }
  return false;
}

function matchRow(row: string[], terms: ParsedFilterTerm[]): boolean {
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]!;
    let matched = false;
    if (term.colIndex !== null) {
      matched = matchCell(row[term.colIndex] ?? '', term);
    } else {
      for (let c = 0; c < row.length; c++) {
        if (matchCell(row[c] ?? '', term)) {
          matched = true;
          break;
        }
      }
    }
    if (term.negated ? matched : !matched) {
      return false;
    }
  }
  return true;
}

function matchRowGroups(row: string[], groups: ParsedFilterTerm[][]): boolean {
  for (let g = 0; g < groups.length; g++) {
    if (matchRow(row, groups[g]!)) return true;
  }
  return false;
}

export function doesCellMatchFilterTerms(
  cell: string,
  colIndex: number,
  terms: ParsedFilterTerm[],
): boolean {
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]!;
    if (term.negated) continue;
    if (term.colIndex !== null && term.colIndex !== colIndex) continue;
    if (matchCell(cell, term)) return true;
  }
  return false;
}

export interface FilterResult {
  /** Data row indices to display in the grid */
  indices: Int32Array;
  /** Exact matched data row indices (subset of indices when contextRows > 0) */
  matchedRowSet: Set<number> | null;
  /** Number of rows directly matching the filter query */
  matchedCount: number;
  /** Map from displayed dataRow -> number of consecutive duplicates collapsed right after it */
  collapsedCounts: Map<number, number> | null;
  /** Positive (non-negated) parsed filter terms for viewport cell highlighting */
  positiveTerms: ParsedFilterTerm[];
  error?: string;
}

export interface FilterOptions {
  query: string;
  contextRows?: number;
  /** Column index to collapse consecutive duplicate values on, or null to disable */
  collapseColIndex?: number | null;
  columnLookup: Map<string, number>;
}

/**
 * Filter a sorted/base Int32Array of row indices without copying underlying CSV rows.
 * Supports Regex, NOT (-), numeric/date comparisons, grep -C context rows, and consecutive dedupe.
 */
export function applyViewFilter(
  rows: string[][],
  baseIndices: Int32Array,
  options: FilterOptions,
): FilterResult {
  const { query, contextRows = 0, collapseColIndex = null, columnLookup } = options;
  const parsed = parseFilterQuery(query, columnLookup);
  if (parsed.error) {
    return {
      indices: baseIndices,
      matchedRowSet: null,
      matchedCount: baseIndices.length,
      collapsedCounts: null,
      positiveTerms: [],
      error: parsed.error,
    };
  }

  const positiveTerms = parsed.groups.flat().filter((t) => !t.negated);

  let working: Int32Array = baseIndices;
  let matchedRowSet: Set<number> | null = null;
  let matchedCount = baseIndices.length;

  if (parsed.groups.length > 0) {
    const len = baseIndices.length;
    const hitPositions: number[] = [];

    for (let v = 0; v < len; v++) {
      const dataRow = baseIndices[v]!;
      const row = rows[dataRow];
      if (row && matchRowGroups(row, parsed.groups)) {
        hitPositions.push(v);
      }
    }

    matchedCount = hitPositions.length;

    if (contextRows > 0 && hitPositions.length > 0) {
      // Merge overlapping [pos - C, pos + C] intervals in O(K) time
      const keepMask = new Uint8Array(len);
      matchedRowSet = new Set<number>();
      let keptTotal = 0;

      for (let i = 0; i < hitPositions.length; i++) {
        const pos = hitPositions[i]!;
        matchedRowSet.add(baseIndices[pos]!);
        const start = Math.max(0, pos - contextRows);
        const end = Math.min(len - 1, pos + contextRows);
        for (let p = start; p <= end; p++) {
          if (keepMask[p] === 0) {
            keepMask[p] = 1;
            keptTotal++;
          }
        }
      }

      const out = new Int32Array(keptTotal);
      let cursor = 0;
      for (let p = 0; p < len; p++) {
        if (keepMask[p] === 1) {
          out[cursor++] = baseIndices[p]!;
        }
      }
      working = out;
    } else {
      const out = new Int32Array(hitPositions.length);
      for (let i = 0; i < hitPositions.length; i++) {
        out[i] = baseIndices[hitPositions[i]!]!;
      }
      working = out;
    }
  }

  // Optional: collapse consecutive duplicates on a target column (non-destructive)
  let collapsedCounts: Map<number, number> | null = null;
  if (collapseColIndex !== null && working.length > 1) {
    collapsedCounts = new Map<number, number>();
    const kept: number[] = [];
    let prevVal: string | undefined;
    let prevDataRow = -1;
    let dupRun = 0;

    for (let i = 0; i < working.length; i++) {
      const dataRow = working[i]!;
      const val = rows[dataRow]?.[collapseColIndex] ?? '';
      if (i > 0 && val === prevVal) {
        dupRun++;
      } else {
        if (dupRun > 0 && prevDataRow !== -1) {
          collapsedCounts.set(prevDataRow, dupRun);
        }
        kept.push(dataRow);
        prevVal = val;
        prevDataRow = dataRow;
        dupRun = 0;
      }
    }
    if (dupRun > 0 && prevDataRow !== -1) {
      collapsedCounts.set(prevDataRow, dupRun);
    }
    working = Int32Array.from(kept);
  }

  return {
    indices: working,
    matchedRowSet,
    matchedCount,
    collapsedCounts,
    positiveTerms,
  };
}

export interface FacetEntry {
  value: string;
  count: number;
}

/**
 * Compute top-N value frequency ranking for a column across the active row indices.
 */
export function computeColumnFacets(
  rows: string[][],
  indices: Int32Array,
  colIndex: number,
  topN = 20,
): { entries: FacetEntry[]; uniqueCount: number; totalCount: number } {
  const counts = new Map<string, number>();
  for (let i = 0; i < indices.length; i++) {
    const val = rows[indices[i]!]?.[colIndex] ?? '';
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({ value, count }));

  return {
    entries: sorted,
    uniqueCount: counts.size,
    totalCount: indices.length,
  };
}
