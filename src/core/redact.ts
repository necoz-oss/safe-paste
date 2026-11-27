import { validateRange } from './range';
import type { RedactionResult, RedactionTarget } from './types';

export { validateRange };

/**
 * Deterministically replaces target ranges with replacement text, preserving 100% of
 * unredacted content without side effects or mutations.
 */
export function redact(
  sourceText: string,
  targets: readonly RedactionTarget[]
): RedactionResult {
  if (targets.length === 0) {
    return {
      success: true,
      text: sourceText,
      appliedCount: 0,
    };
  }

  // Sort targets by start ascending
  const sortedTargets = [...targets].sort((a, b) => a.range.start - b.range.start);

  let lastEnd = 0;
  for (const target of sortedTargets) {
    const validation = validateRange(target.range, sourceText);
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason,
        error: validation.error,
      };
    }

    if (target.range.start < lastEnd) {
      return {
        success: false,
        reason: 'overlapping_targets',
        error: `Target range [${target.range.start}, ${target.range.end}) overlaps with previous target ending at ${lastEnd}`,
      };
    }

    lastEnd = target.range.end;
  }

  let cursor = 0;
  let result = '';

  for (const target of sortedTargets) {
    result += sourceText.slice(cursor, target.range.start);
    result += target.replacementText;
    cursor = target.range.end;
  }
  result += sourceText.slice(cursor);

  return {
    success: true,
    text: result,
    appliedCount: sortedTargets.length,
  };
}
