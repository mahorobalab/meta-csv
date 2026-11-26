import { describe, expect, it } from 'vitest';
import {
  computeNextCellPosition,
  isCellInsideRange,
} from '../editor/utils/cellNavigationUtils';

describe('cellNavigationUtils', () => {
  const multiRange = { x: 1, y: 2, width: 3, height: 2 }; // cols 1..3, rows 2..3

  it('Tab moves right inside multi-cell selection and wraps to next row left, then top-left', () => {
    expect(computeNextCellPosition([1, 2], multiRange, 'tab', 10, 10)).toEqual({
      nextCell: [2, 2],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Right edge of row 2 -> left edge of row 3
    expect(computeNextCellPosition([3, 2], multiRange, 'tab', 10, 10)).toEqual({
      nextCell: [1, 3],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Bottom-right -> wrap to top-left
    expect(computeNextCellPosition([3, 3], multiRange, 'tab', 10, 10)).toEqual({
      nextCell: [1, 2],
      nextRange: multiRange,
      keptSelection: true,
    });
  });

  it('Shift+Tab moves left inside multi-cell selection and wraps backward', () => {
    expect(computeNextCellPosition([1, 3], multiRange, 'shift-tab', 10, 10)).toEqual({
      nextCell: [3, 2],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Top-left -> wrap to bottom-right
    expect(computeNextCellPosition([1, 2], multiRange, 'shift-tab', 10, 10)).toEqual({
      nextCell: [3, 3],
      nextRange: multiRange,
      keptSelection: true,
    });
  });

  it('Enter moves down inside multi-cell selection and wraps to top of next column, then top-left', () => {
    expect(computeNextCellPosition([1, 2], multiRange, 'enter', 10, 10)).toEqual({
      nextCell: [1, 3],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Bottom of col 1 -> top of col 2
    expect(computeNextCellPosition([1, 3], multiRange, 'enter', 10, 10)).toEqual({
      nextCell: [2, 2],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Bottom-right -> wrap to top-left
    expect(computeNextCellPosition([3, 3], multiRange, 'enter', 10, 10)).toEqual({
      nextCell: [1, 2],
      nextRange: multiRange,
      keptSelection: true,
    });
  });

  it('Shift+Enter moves up inside multi-cell selection and wraps backward', () => {
    expect(computeNextCellPosition([2, 2], multiRange, 'shift-enter', 10, 10)).toEqual({
      nextCell: [1, 3],
      nextRange: multiRange,
      keptSelection: true,
    });
    // Top-left -> wrap to bottom-right
    expect(computeNextCellPosition([1, 2], multiRange, 'shift-enter', 10, 10)).toEqual({
      nextCell: [3, 3],
      nextRange: multiRange,
      keptSelection: true,
    });
  });

  it('Single-cell selection moves across grid bounds cleanly', () => {
    const single = { x: 2, y: 0, width: 1, height: 1 };
    expect(computeNextCellPosition([2, 0], single, 'tab', 3, 4)).toEqual({
      nextCell: [0, 1],
      nextRange: { x: 0, y: 1, width: 1, height: 1 },
      keptSelection: false,
    });
    expect(computeNextCellPosition([2, 0], single, 'enter', 3, 4)).toEqual({
      nextCell: [2, 1],
      nextRange: { x: 2, y: 1, width: 1, height: 1 },
      keptSelection: false,
    });
    expect(computeNextCellPosition([2, 3], { x: 2, y: 3, width: 1, height: 1 }, 'enter', 3, 4)).toEqual({
      nextCell: [2, 3],
      nextRange: { x: 2, y: 3, width: 1, height: 1 },
      keptSelection: false,
    });
  });

  it('isCellInsideRange checks range containment accurately', () => {
    expect(isCellInsideRange(1, 2, multiRange)).toBe(true);
    expect(isCellInsideRange(3, 3, multiRange)).toBe(true);
    expect(isCellInsideRange(4, 2, multiRange)).toBe(false);
    expect(isCellInsideRange(1, 4, multiRange)).toBe(false);
  });
});
