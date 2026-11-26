import { describe, expect, it } from 'vitest';
import type { RangeStyleRule } from '@metatext-editor/schema';
import {
  didUpdaterClearAnyProperty,
  getOverlappingRangeStyle,
  subtractRectFromRanges,
} from '../editor/utils/styleRangeUtils';

describe('styleRangeUtils', () => {
  it('removes a range completely covered by the cleared rect', () => {
    const rules: RangeStyleRule[] = [
      { ref: '10:1..11:3', style: { backgroundColor: '#ede9fe' } },
      { ref: '20:0..21:1', style: { bold: true } },
    ];
    const { nextRanges, changed } = subtractRectFromRanges(rules, {
      startRow: 10,
      endRow: 11,
      startCol: 1,
      endCol: 3,
    });
    expect(changed).toBe(true);
    expect(nextRanges).toEqual([{ ref: '20:0..21:1', style: { bold: true } }]);
  });

  it('splits a range into up to 4 remainders when clearing an interior single cell', () => {
    const rules: RangeStyleRule[] = [
      { ref: '0:0..2:2', style: { backgroundColor: '#bfdbfe' } },
    ];
    const { nextRanges, changed } = subtractRectFromRanges(rules, {
      startRow: 1,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    });
    expect(changed).toBe(true);
    expect(nextRanges.map((r) => r.ref)).toEqual([
      '0:0..0:2',
      '2:0..2:2',
      '1:0..1:0',
      '1:2..1:2',
    ]);
  });

  it('splits a range cleanly when clearing a partial edge overlap', () => {
    const rules: RangeStyleRule[] = [
      { ref: '5:2..7:4', style: { backgroundColor: '#fecaca' } },
    ];
    const { nextRanges, changed } = subtractRectFromRanges(rules, {
      startRow: 5,
      endRow: 6,
      startCol: 2,
      endCol: 4,
    });
    expect(changed).toBe(true);
    expect(nextRanges).toEqual([
      { ref: '7:2..7:4', style: { backgroundColor: '#fecaca' } },
    ]);
  });

  it('returns changed=false when there is no overlap', () => {
    const rules: RangeStyleRule[] = [
      { ref: '0:0..1:1', style: { italic: true } },
    ];
    const { nextRanges, changed } = subtractRectFromRanges(rules, {
      startRow: 5,
      endRow: 6,
      startCol: 5,
      endCol: 6,
    });
    expect(changed).toBe(false);
    expect(nextRanges).toEqual(rules);
  });

  it('resolves overlapping range styles for a cell and detects cleared properties', () => {
    const rules: RangeStyleRule[] = [
      { ref: '75:2..76:4', style: { backgroundColor: '#ede9fe', bold: true } },
    ];
    const merged = getOverlappingRangeStyle(rules, undefined, 75, 3);
    expect(merged).toEqual({ backgroundColor: '#ede9fe', bold: true });

    expect(
      didUpdaterClearAnyProperty(merged!, (s) => ({ ...s, backgroundColor: undefined })),
    ).toBe(true);
    expect(
      didUpdaterClearAnyProperty(merged!, (s) => ({ ...s, backgroundColor: '#bfdbfe' })),
    ).toBe(false);
  });
});
