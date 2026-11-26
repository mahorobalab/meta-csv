import { parseRangeRef, resolveStyleRef, type ParsedRange } from '@metatext-editor/core';
import type { CellStyle, RangeStyleRule } from '@metatext-editor/schema';

export function formatRangeRef(r: ParsedRange): string {
  return `${r.startRow}:${r.startCol}..${r.endRow}:${r.endCol}`;
}

export function rangesOverlap(a: ParsedRange, b: ParsedRange): boolean {
  return !(
    a.endRow < b.startRow ||
    a.startRow > b.endRow ||
    a.endCol < b.startCol ||
    a.startCol > b.endCol
  );
}

/**
 * Subtract a rectangular area `cut` from a list of RangeStyleRules.
 * Non-overlapping rules are preserved unchanged; fully covered rules are removed;
 * partially overlapping rules are split into up to 4 non-overlapping remainder rectangles.
 */
export function subtractRectFromRanges(
  ranges: readonly RangeStyleRule[],
  cut: ParsedRange,
): { nextRanges: RangeStyleRule[]; changed: boolean } {
  const nextRanges: RangeStyleRule[] = [];
  let changed = false;

  for (const rule of ranges) {
    const parsed = parseRangeRef(rule.ref);
    if (!parsed || !rangesOverlap(parsed, cut)) {
      nextRanges.push(rule);
      continue;
    }

    changed = true;

    // Top strip (above cut)
    if (parsed.startRow < cut.startRow) {
      nextRanges.push({
        ref: formatRangeRef({
          startRow: parsed.startRow,
          endRow: cut.startRow - 1,
          startCol: parsed.startCol,
          endCol: parsed.endCol,
        }),
        style: rule.style,
      });
    }

    // Bottom strip (below cut)
    if (parsed.endRow > cut.endRow) {
      nextRanges.push({
        ref: formatRangeRef({
          startRow: cut.endRow + 1,
          endRow: parsed.endRow,
          startCol: parsed.startCol,
          endCol: parsed.endCol,
        }),
        style: rule.style,
      });
    }

    const midStartRow = Math.max(parsed.startRow, cut.startRow);
    const midEndRow = Math.min(parsed.endRow, cut.endRow);

    // Left strip (left of cut within middle rows)
    if (parsed.startCol < cut.startCol) {
      nextRanges.push({
        ref: formatRangeRef({
          startRow: midStartRow,
          endRow: midEndRow,
          startCol: parsed.startCol,
          endCol: cut.startCol - 1,
        }),
        style: rule.style,
      });
    }

    // Right strip (right of cut within middle rows)
    if (parsed.endCol > cut.endCol) {
      nextRanges.push({
        ref: formatRangeRef({
          startRow: midStartRow,
          endRow: midEndRow,
          startCol: cut.endCol + 1,
          endCol: parsed.endCol,
        }),
        style: rule.style,
      });
    }
  }

  return { nextRanges, changed };
}

/**
 * Compute merged style from all range rules that cover a specific (dataRow, colIndex) cell.
 */
export function getOverlappingRangeStyle(
  ranges: readonly RangeStyleRule[] | undefined,
  palette: Record<string, CellStyle> | undefined,
  dataRow: number,
  colIndex: number,
): CellStyle | undefined {
  if (!ranges || ranges.length === 0) return undefined;
  let merged: CellStyle | undefined;
  for (const rule of ranges) {
    const parsed = parseRangeRef(rule.ref);
    if (!parsed) continue;
    if (
      dataRow >= parsed.startRow &&
      dataRow <= parsed.endRow &&
      colIndex >= parsed.startCol &&
      colIndex <= parsed.endCol
    ) {
      const st = resolveStyleRef(rule.style, palette);
      if (st) {
        merged = merged ? { ...merged, ...st } : { ...st };
      }
    }
  }
  return merged;
}

/**
 * Check whether applying `updater` to `base` explicitly clears (sets to undefined)
 * at least one property that was previously defined in `base`.
 */
export function didUpdaterClearAnyProperty(
  base: CellStyle,
  updater: (current: CellStyle) => CellStyle,
): boolean {
  const next = updater({ ...base });
  for (const key of Object.keys(base) as Array<keyof CellStyle>) {
    if (base[key] !== undefined && next[key] === undefined) {
      return true;
    }
  }
  return false;
}
