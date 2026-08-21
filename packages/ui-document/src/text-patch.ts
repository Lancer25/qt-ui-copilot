import type { SourceRange } from './parse-ui.js';

/** Shared patch shape for Task 4. This module intentionally does not mutate XML. */
export interface TextPatch {
  range: SourceRange;
  replacement: string;
}

export function applyTextPatches(source: string, patches: readonly TextPatch[]): string {
  const descending = [...patches].sort((left, right) => right.range.start - left.range.start);
  let result = source;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const patch of descending) {
    if (patch.range.start < 0 || patch.range.end < patch.range.start || patch.range.end > source.length) {
      throw new Error('Text patch range is outside source');
    }
    if (patch.range.end > previousStart) throw new Error('Text patches overlap');
    result = `${result.slice(0, patch.range.start)}${patch.replacement}${result.slice(patch.range.end)}`;
    previousStart = patch.range.start;
  }
  return result;
}
