import { applyEdits, modify, parse as parseJsonc, type JSONPath } from 'jsonc-parser';
import {
  DEFAULT_META_VERSION,
  type CellStyle,
  type ConditionalRule,
  type MetaCsvDocument,
  type StyleRef,
} from '@meta-csv/schema';

export function parseMetaJsonc(text: string | null): MetaCsvDocument {
  if (!text || text.trim().length === 0) {
    return { version: DEFAULT_META_VERSION };
  }
  const parsed = parseJsonc(text);
  if (!parsed || typeof parsed !== 'object') {
    return { version: DEFAULT_META_VERSION };
  }
  return parsed as MetaCsvDocument;
}

export function createInitialMetaJsonc(schemaUrl?: string): string {
  const lines = ['{'];
  if (schemaUrl) {
    lines.push(`  "$schema": "${schemaUrl}",`);
  }
  lines.push(`  "version": "${DEFAULT_META_VERSION}"`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * Update a single path inside a JSONC document while preserving comments and formatting.
 */
export function patchMetaJsonc(
  sourceText: string | null,
  path: JSONPath,
  value: unknown,
): string {
  const base =
    sourceText && sourceText.trim().length > 0
      ? sourceText
      : createInitialMetaJsonc();
  const edits = modify(base, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
      eol: '\n',
    },
  });
  return applyEdits(base, edits);
}

export interface ParsedRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

const RANGE_RE = /^(\d+):(\d+)\.\.(\d+):(\d+)$/;

export function parseRangeRef(ref: string): ParsedRange | null {
  const m = RANGE_RE.exec(ref);
  if (!m) return null;
  const r1 = Number(m[1]);
  const c1 = Number(m[2]);
  const r2 = Number(m[3]);
  const c2 = Number(m[4]);
  return {
    startRow: Math.min(r1, r2),
    startCol: Math.min(c1, c2),
    endRow: Math.max(r1, r2),
    endCol: Math.max(c1, c2),
  };
}

export function resolveStyleRef(
  ref: StyleRef | undefined,
  palette: Record<string, CellStyle> | undefined,
): CellStyle | undefined {
  if (!ref) return undefined;
  if (typeof ref === 'string') {
    return palette?.[ref];
  }
  return ref;
}

export function evaluateRuleCondition(
  rule: ConditionalRule,
  rowValues: string[],
  columnIndexByKey: Map<string, number>,
): boolean {
  const colIdx = columnIndexByKey.get(rule.when.column);
  if (colIdx === undefined) return false;
  const cellVal = rowValues[colIdx] ?? '';
  const targetVal = rule.when.value ?? '';

  switch (rule.when.operator) {
    case 'equals':
      return cellVal === targetVal;
    case 'notEquals':
      return cellVal !== targetVal;
    case 'contains':
      return cellVal.includes(targetVal);
    case 'startsWith':
      return cellVal.startsWith(targetVal);
    case 'empty':
      return cellVal.trim().length === 0;
    case 'notEmpty':
      return cellVal.trim().length > 0;
    case 'regex':
      try {
        return new RegExp(targetVal).test(cellVal);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export interface StyleResolverContext {
  meta: MetaCsvDocument;
  columnKeys: string[];
  columnIndexByKey: Map<string, number>;
  parsedRanges: Array<{ range: ParsedRange; style: CellStyle }>;
}

export function createStyleResolverContext(
  meta: MetaCsvDocument,
  columnKeys: string[],
): StyleResolverContext {
  const columnIndexByKey = new Map<string, number>();
  columnKeys.forEach((key, idx) => columnIndexByKey.set(key, idx));

  const parsedRanges: Array<{ range: ParsedRange; style: CellStyle }> = [];
  if (meta.ranges) {
    for (const item of meta.ranges) {
      const range = parseRangeRef(item.ref);
      const style = resolveStyleRef(item.style, meta.styles);
      if (range && style) {
        parsedRanges.push({ range, style });
      }
    }
  }

  return { meta, columnKeys, columnIndexByKey, parsedRanges };
}

/**
 * Resolve final CellStyle across the 5-layer cascade:
 * 1. table -> 2. columns -> 3. rules -> 4. ranges -> 5. rows -> cells
 */
export function resolveCellStyle(
  ctx: StyleResolverContext,
  dataRowIndex: number,
  colIndex: number,
  rowValues: string[],
): CellStyle | undefined {
  const { meta, columnKeys, columnIndexByKey, parsedRanges } = ctx;
  const colKey = columnKeys[colIndex] ?? String(colIndex);
  let merged: CellStyle | undefined;

  const merge = (next: CellStyle | undefined) => {
    if (!next) return;
    merged = merged ? { ...merged, ...next } : { ...next };
  };

  // 2. Column style
  merge(resolveStyleRef(meta.columns?.[colKey]?.style, meta.styles));

  // 3. Conditional rules
  if (meta.rules) {
    for (const rule of meta.rules) {
      const target = rule.target ?? 'cell';
      const ruleColIdx = columnIndexByKey.get(rule.when.column);
      if (target === 'cell' && ruleColIdx !== colIndex) continue;
      if (evaluateRuleCondition(rule, rowValues, columnIndexByKey)) {
        merge(resolveStyleRef(rule.style, meta.styles));
      }
    }
  }

  // 4. Rectangular ranges
  for (const entry of parsedRanges) {
    const { startRow, endRow, startCol, endCol } = entry.range;
    if (
      dataRowIndex >= startRow &&
      dataRowIndex <= endRow &&
      colIndex >= startCol &&
      colIndex <= endCol
    ) {
      merge(entry.style);
    }
  }

  // 5a. Row override
  merge(resolveStyleRef(meta.rows?.[String(dataRowIndex)]?.style, meta.styles));

  // 5b. Cell override (supports both "<row>:<colKey>" and "<row>:<colIndex>")
  const byKey = meta.cells?.[`${dataRowIndex}:${colKey}`];
  const byIdx =
    colKey !== String(colIndex) ? meta.cells?.[`${dataRowIndex}:${colIndex}`] : undefined;
  merge(resolveStyleRef(byKey ?? byIdx, meta.styles));

  return merged;
}
