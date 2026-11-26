import type { CellRangeRect } from '../types';

export type CellMoveDirection = 'tab' | 'shift-tab' | 'enter' | 'shift-enter';

export interface NextCellResult {
  nextCell: [number, number];
  nextRange: CellRangeRect;
  /** True when movement stayed inside an existing multi-cell selection */
  keptSelection: boolean;
}

/**
 * Excel-compatible cell navigation for Tab / Shift+Tab / Enter / Shift+Enter.
 *
 * - Multi-cell selection (`width > 1 || height > 1`):
 *   Keeps the selection rectangle intact and moves only the active cell:
 *   - Tab: right -> wrap to left edge of next row -> wrap to top-left
 *   - Shift+Tab: left -> wrap to right edge of previous row -> wrap to bottom-right
 *   - Enter: down -> wrap to top of next column -> wrap to top-left
 *   - Shift+Enter: up -> wrap to bottom of previous column -> wrap to bottom-right
 *
 * - Single-cell selection (`1x1`):
 *   Moves to the adjacent cell (wrapping Tab across rows, clamping Enter at top/bottom).
 */
export function computeNextCellPosition(
  cell: readonly [number, number],
  range: CellRangeRect,
  direction: CellMoveDirection,
  totalCols: number,
  totalRows: number,
): NextCellResult {
  const maxGridCol = Math.max(0, totalCols - 1);
  const maxGridRow = Math.max(0, totalRows - 1);
  const curCol = Math.max(0, Math.min(maxGridCol, cell[0]));
  const curRow = Math.max(0, Math.min(maxGridRow, cell[1]));

  const isMulti = range.width > 1 || range.height > 1;
  if (isMulti) {
    const minX = Math.max(0, Math.min(maxGridCol, range.x));
    const maxX = Math.max(minX, Math.min(maxGridCol, range.x + range.width - 1));
    const minY = Math.max(0, Math.min(maxGridRow, range.y));
    const maxY = Math.max(minY, Math.min(maxGridRow, range.y + range.height - 1));

    let nextCol = Math.max(minX, Math.min(maxX, curCol));
    let nextRow = Math.max(minY, Math.min(maxY, curRow));

    if (direction === 'tab') {
      if (nextCol < maxX) {
        nextCol++;
      } else {
        nextCol = minX;
        nextRow = nextRow < maxY ? nextRow + 1 : minY;
      }
    } else if (direction === 'shift-tab') {
      if (nextCol > minX) {
        nextCol--;
      } else {
        nextCol = maxX;
        nextRow = nextRow > minY ? nextRow - 1 : maxY;
      }
    } else if (direction === 'enter') {
      if (nextRow < maxY) {
        nextRow++;
      } else {
        nextRow = minY;
        nextCol = nextCol < maxX ? nextCol + 1 : minX;
      }
    } else {
      // shift-enter
      if (nextRow > minY) {
        nextRow--;
      } else {
        nextRow = maxY;
        nextCol = nextCol > minX ? nextCol - 1 : maxX;
      }
    }

    return {
      nextCell: [nextCol, nextRow],
      nextRange: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      keptSelection: true,
    };
  }

  let nextCol = curCol;
  let nextRow = curRow;

  if (direction === 'tab') {
    if (nextCol < maxGridCol) {
      nextCol++;
    } else if (nextRow < maxGridRow) {
      nextCol = 0;
      nextRow++;
    }
  } else if (direction === 'shift-tab') {
    if (nextCol > 0) {
      nextCol--;
    } else if (nextRow > 0) {
      nextCol = maxGridCol;
      nextRow--;
    }
  } else if (direction === 'enter') {
    if (nextRow < maxGridRow) {
      nextRow++;
    }
  } else {
    // shift-enter
    if (nextRow > 0) {
      nextRow--;
    }
  }

  return {
    nextCell: [nextCol, nextRow],
    nextRange: { x: nextCol, y: nextRow, width: 1, height: 1 },
    keptSelection: false,
  };
}

export function isCellInsideRange(
  col: number,
  row: number,
  range: CellRangeRect,
): boolean {
  return (
    col >= range.x &&
    col < range.x + range.width &&
    row >= range.y &&
    row < range.y + range.height
  );
}
