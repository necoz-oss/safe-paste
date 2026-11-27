import { describe, expect, it } from 'vitest';
import { isLeadingSurrogate, isTrailingSurrogate, validateRange } from '../../src/core/range';

describe('Core Range Validation Module', () => {
  it('correctly identifies leading and trailing UTF-16 surrogates', () => {
    // High surrogate range: 0xD800 - 0xDBFF
    expect(isLeadingSurrogate(0xd800)).toBe(true);
    expect(isLeadingSurrogate(0xd83d)).toBe(true);
    expect(isLeadingSurrogate(0xdbff)).toBe(true);
    expect(isLeadingSurrogate(0xd7ff)).toBe(false);
    expect(isLeadingSurrogate(0xdc00)).toBe(false);

    // Low surrogate range: 0xDC00 - 0xDFFF
    expect(isTrailingSurrogate(0xdc00)).toBe(true);
    expect(isTrailingSurrogate(0xde80)).toBe(true);
    expect(isTrailingSurrogate(0xdfff)).toBe(true);
    expect(isTrailingSurrogate(0xdbff)).toBe(false);
    expect(isTrailingSurrogate(0xe000)).toBe(false);
  });

  it('accepts valid range within bounds', () => {
    const text = 'hello world';
    const result = validateRange({ start: 0, end: 5 }, text);
    expect(result).toEqual({ valid: true });

    const fullSpan = validateRange({ start: 0, end: text.length }, text);
    expect(fullSpan).toEqual({ valid: true });
  });

  it('rejects empty ranges where start === end', () => {
    const text = 'sample text';
    const result = validateRange({ start: 3, end: 3 }, text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_range');
      expect(result.error).toContain('is invalid or out of bounds');
    }
  });

  it('rejects inverted ranges where start > end', () => {
    const text = 'sample text';
    const result = validateRange({ start: 5, end: 2 }, text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_range');
    }
  });

  it('rejects negative start or end offsets', () => {
    const text = 'sample text';
    const res1 = validateRange({ start: -1, end: 4 }, text);
    expect(res1.valid).toBe(false);
    if (!res1.valid) expect(res1.reason).toBe('invalid_range');

    const res2 = validateRange({ start: -5, end: -1 }, text);
    expect(res2.valid).toBe(false);
    if (!res2.valid) expect(res2.reason).toBe('invalid_range');
  });

  it('rejects out-of-bounds end offset exceeding source length', () => {
    const text = 'short';
    const result = validateRange({ start: 0, end: 10 }, text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_range');
    }
  });

  it('rejects non-integer offsets (NaN, Infinity, floats)', () => {
    const text = 'sample text';
    const res1 = validateRange({ start: 1.5, end: 4 }, text);
    expect(res1.valid).toBe(false);
    if (!res1.valid) expect(res1.reason).toBe('invalid_range');

    const res2 = validateRange({ start: 0, end: NaN }, text);
    expect(res2.valid).toBe(false);
    if (!res2.valid) expect(res2.reason).toBe('invalid_range');

    const res3 = validateRange({ start: -Infinity, end: 4 }, text);
    expect(res3.valid).toBe(false);
    if (!res3.valid) expect(res3.reason).toBe('invalid_range');
  });

  it('rejects ranges that split a surrogate pair at start offset', () => {
    // '🚀' is \uD83D\uDE80 at indices 1 and 2
    const text = 'A🚀B';
    const result = validateRange({ start: 2, end: 4 }, text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('surrogate_boundary_split');
      expect(result.error).toContain('start offset 2 splits a Unicode surrogate pair');
    }
  });

  it('rejects ranges that split a surrogate pair at end offset', () => {
    // '😸' is \uD83D\uDE38 at indices 3 and 4
    const text = 'cat😸box';
    const result = validateRange({ start: 0, end: 4 }, text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('surrogate_boundary_split');
      expect(result.error).toContain('end offset 4 splits a Unicode surrogate pair');
    }
  });

  it('accepts range cleanly enclosing complete surrogate pair', () => {
    const text = 'A🚀B';
    const result = validateRange({ start: 1, end: 3 }, text);
    expect(result).toEqual({ valid: true });
  });
});
