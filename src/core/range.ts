import type { TextRange } from './types';

/**
 * Checks if a 16-bit code unit is a leading (high) UTF-16 surrogate (0xD800 - 0xDBFF).
 */
export function isLeadingSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Checks if a 16-bit code unit is a trailing (low) UTF-16 surrogate (0xDC00 - 0xDFFF).
 */
export function isTrailingSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export type RangeValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: 'invalid_range' | 'surrogate_boundary_split';
      readonly error: string;
    };

/**
 * Validates range boundaries and ensures they do not split a Unicode surrogate pair.
 * Enforces integer offsets and 0 <= start < end <= sourceText.length.
 */
export function validateRange(
  range: TextRange,
  sourceText: string
): RangeValidationResult {
  const { start, end } = range;
  const sourceLength = sourceText.length;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return {
      valid: false,
      reason: 'invalid_range',
      error: `Range start and end must be integers; received start=${start}, end=${end}`,
    };
  }

  // Acceptance criteria #15: 0 <= start < end <= source.length
  if (start < 0 || end <= start || end > sourceLength) {
    return {
      valid: false,
      reason: 'invalid_range',
      error: `Range [${start}, ${end}) is invalid or out of bounds for string of length ${sourceLength}`,
    };
  }

  // Range start slicing inside a surrogate pair
  if (
    start > 0 &&
    start < sourceLength &&
    isTrailingSurrogate(sourceText.charCodeAt(start)) &&
    isLeadingSurrogate(sourceText.charCodeAt(start - 1))
  ) {
    return {
      valid: false,
      reason: 'surrogate_boundary_split',
      error: `Range start offset ${start} splits a Unicode surrogate pair`,
    };
  }

  // Range end slicing inside a surrogate pair
  if (
    end > 0 &&
    end < sourceLength &&
    isTrailingSurrogate(sourceText.charCodeAt(end)) &&
    isLeadingSurrogate(sourceText.charCodeAt(end - 1))
  ) {
    return {
      valid: false,
      reason: 'surrogate_boundary_split',
      error: `Range end offset ${end} splits a Unicode surrogate pair`,
    };
  }

  return { valid: true };
}
