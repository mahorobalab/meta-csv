/**
 * Pure index / order / key helpers for MetaTextEditor row & column operations.
 */

export function insertRowsIntoOrderArray(
  prev: Int32Array,
  insertDataIdx: number,
  count: number,
  insertViewPos: number,
): Int32Array {
  const next = new Int32Array(prev.length + count);
  const clampedPos = Math.max(0, Math.min(prev.length, insertViewPos));
  let write = 0;
  for (let i = 0; i < clampedPos; i++) {
    const v = prev[i]!;
    next[write++] = v >= insertDataIdx ? v + count : v;
  }
  for (let k = 0; k < count; k++) {
    next[write++] = insertDataIdx + k;
  }
  for (let i = clampedPos; i < prev.length; i++) {
    const v = prev[i]!;
    next[write++] = v >= insertDataIdx ? v + count : v;
  }
  return next;
}

export function removeRowsFromOrderArray(
  prev: Int32Array,
  removedDesc: number[],
): Int32Array {
  const removedSet = new Set(removedDesc);
  const kept: number[] = [];
  for (let i = 0; i < prev.length; i++) {
    const v = prev[i]!;
    if (removedSet.has(v)) continue;
    let shift = 0;
    for (let j = 0; j < removedDesc.length; j++) {
      if (removedDesc[j]! < v) shift++;
    }
    kept.push(v - shift);
  }
  return Int32Array.from(kept);
}

export function appendRowsToOrderArray(
  prev: Int32Array,
  appendedDataRows: number[],
): Int32Array {
  if (appendedDataRows.length === 0) return prev;
  const next = new Int32Array(prev.length + appendedDataRows.length);
  next.set(prev, 0);
  for (let i = 0; i < appendedDataRows.length; i++) {
    next[prev.length + i] = appendedDataRows[i]!;
  }
  return next;
}

export function isContiguousIndices(indices: number[]): boolean {
  if (indices.length <= 1) return true;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i]! !== indices[i - 1]! + 1) return false;
  }
  return true;
}

export function makeUniqueColumnKey(base: string, existingKeys: string[]): string {
  const set = new Set(existingKeys);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function rotateArrayBlock<T>(
  arr: T[],
  startIdx: number,
  endIdx: number,
  direction: -1 | 1,
): T[] {
  const next = [...arr];
  if (direction === -1) {
    if (startIdx <= 0) return next;
    const [moved] = next.splice(startIdx - 1, 1);
    next.splice(endIdx, 0, moved!);
  } else {
    if (endIdx >= next.length - 1) return next;
    const [moved] = next.splice(endIdx + 1, 1);
    next.splice(startIdx, 0, moved!);
  }
  return next;
}
