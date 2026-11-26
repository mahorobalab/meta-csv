import { describe, expect, it } from 'vitest';
import {
  appendRowsToOrderArray,
  insertRowsIntoOrderArray,
  isContiguousIndices,
  makeUniqueColumnKey,
  removeRowsFromOrderArray,
  rotateArrayBlock,
} from '../editor/utils/rowOrderUtils';

describe('rowOrderUtils', () => {
  it('insertRowsIntoOrderArray shifts indices >= insertDataIdx and inserts at viewPos', () => {
    const prev = Int32Array.from([2, 0, 1]);
    const next = insertRowsIntoOrderArray(prev, 1, 2, 1);
    expect(Array.from(next)).toEqual([4, 1, 2, 0, 3]);
  });

  it('insertRowsIntoOrderArray clamps out-of-bounds viewPos', () => {
    const prev = Int32Array.from([0, 1]);
    expect(Array.from(insertRowsIntoOrderArray(prev, 2, 1, 99))).toEqual([0, 1, 2]);
    expect(Array.from(insertRowsIntoOrderArray(prev, 0, 1, -5))).toEqual([0, 1, 2]);
  });

  it('removeRowsFromOrderArray removes rows and decrements higher data indices', () => {
    const prev = Int32Array.from([3, 1, 0, 2, 4]);
    const next = removeRowsFromOrderArray(prev, [3, 1]);
    expect(Array.from(next)).toEqual([0, 1, 2]);
  });

  it('appendRowsToOrderArray appends new data indices to the end', () => {
    const prev = Int32Array.from([1, 0]);
    expect(Array.from(appendRowsToOrderArray(prev, [2, 3]))).toEqual([1, 0, 2, 3]);
    expect(appendRowsToOrderArray(prev, [])).toBe(prev);
  });

  it('isContiguousIndices checks contiguous ascending sequences', () => {
    expect(isContiguousIndices([])).toBe(true);
    expect(isContiguousIndices([4])).toBe(true);
    expect(isContiguousIndices([2, 3, 4])).toBe(true);
    expect(isContiguousIndices([2, 4])).toBe(false);
    expect(isContiguousIndices([4, 3])).toBe(false);
  });

  it('makeUniqueColumnKey generates unique suffixed keys on collision', () => {
    expect(makeUniqueColumnKey('price', ['id', 'name'])).toBe('price');
    expect(makeUniqueColumnKey('price', ['id', 'price'])).toBe('price_2');
    expect(makeUniqueColumnKey('price', ['price', 'price_2', 'price_3'])).toBe('price_4');
  });

  it('rotateArrayBlock shifts a contiguous block left or right', () => {
    expect(rotateArrayBlock(['a', 'b', 'c', 'd', 'e'], 2, 3, -1)).toEqual([
      'a',
      'c',
      'd',
      'b',
      'e',
    ]);
    expect(rotateArrayBlock(['a', 'b', 'c', 'd', 'e'], 1, 2, 1)).toEqual([
      'a',
      'd',
      'b',
      'c',
      'e',
    ]);
    expect(rotateArrayBlock(['a', 'b'], 0, 0, -1)).toEqual(['a', 'b']);
    expect(rotateArrayBlock(['a', 'b'], 1, 1, 1)).toEqual(['a', 'b']);
  });
});
