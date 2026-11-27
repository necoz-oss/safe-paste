import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detect';
import type { DetectorRule, Finding } from '../../src/core/types';

describe('Core Detect Module', () => {
  it('returns clean status for empty input', () => {
    const result = detect('');
    expect(result).toEqual({
      status: 'clean',
      findings: [],
    });
  });

  it('returns clean status when no rules are provided', () => {
    const result = detect('some arbitrary text', { rules: [] });
    expect(result).toEqual({
      status: 'clean',
      findings: [],
    });
  });

  it('halts with limit_exceeded when input exceeds maxInputLength budget', () => {
    const largeText = 'a'.repeat(200);
    const result = detect(largeText, { maxInputLength: 100 });

    expect(result.status).toBe('limit_exceeded');
    expect(result.findings.length).toBe(0);
    expect(result.limitDetails).toEqual({
      reason: 'input_too_large',
      limit: 100,
      actual: 200,
    });
  });

  it('halts with limit_exceeded when finding count exceeds maxFindings cap and stops generation', () => {
    let generatedCount = 0;
    const syntheticRule: DetectorRule = {
      id: 'mock_repeating_rule',
      category: 'mock_category',
      *detect() {
        for (let i = 0; i < 10; i++) {
          generatedCount++;
          yield {
            id: `mock_${i}`,
            category: 'mock_category',
            range: { start: i * 2, end: i * 2 + 1 },
            mask: 'mock_••••',
            replacementText: '[MOCK]',
          };
        }
      },
    };

    const result = detect('test string with sufficient length', {
      rules: [syntheticRule],
      maxFindings: 5,
    });

    expect(result.status).toBe('limit_exceeded');
    expect(result.findings.length).toBe(0);
    expect(result.limitDetails).toEqual({
      reason: 'too_many_findings',
      limit: 5,
      actual: 6,
    });
    // Generation halts immediately upon encountering the first candidate beyond budget (5 + 1)
    expect(generatedCount).toBe(6);
  });

  it('completes normally when findings count is exactly at maxFindings limit', () => {
    let generatedCount = 0;
    const exactLimitRule: DetectorRule = {
      id: 'mock_exact_limit_rule',
      category: 'mock_category',
      *detect() {
        for (let i = 0; i < 5; i++) {
          generatedCount++;
          yield {
            id: `mock_${i}`,
            category: 'mock_category',
            range: { start: i * 4, end: i * 4 + 2 },
            mask: 'mock_••••',
            replacementText: '[MOCK]',
          };
        }
      },
    };

    const result = detect('test string of plenty characters length', {
      rules: [exactLimitRule],
      maxFindings: 5,
    });

    expect(result.status).toBe('findings');
    expect(result.findings.length).toBe(5);
    expect(generatedCount).toBe(5);
  });

  it('enforces shared finding budget across multiple rules and stops early', () => {
    let rule1Count = 0;
    let rule2Count = 0;
    let rule3Called = false;

    const rule1: DetectorRule = {
      id: 'rule1',
      category: 'cat1',
      *detect() {
        for (let i = 0; i < 3; i++) {
          rule1Count++;
          yield {
            id: `r1_${i}`,
            category: 'cat1',
            range: { start: i * 2, end: i * 2 + 1 },
            mask: 'm1_••••',
            replacementText: '[R1]',
          };
        }
      },
    };

    const rule2: DetectorRule = {
      id: 'rule2',
      category: 'cat2',
      *detect() {
        for (let i = 0; i < 3; i++) {
          rule2Count++;
          yield {
            id: `r2_${i}`,
            category: 'cat2',
            range: { start: 10 + i * 2, end: 10 + i * 2 + 1 },
            mask: 'm2_••••',
            replacementText: '[R2]',
          };
        }
      },
    };

    const rule3: DetectorRule = {
      id: 'rule3',
      category: 'cat3',
      *detect() {
        rule3Called = true;
        yield {
          id: 'r3_0',
          category: 'cat3',
          range: { start: 30, end: 35 },
          mask: 'm3_••••',
          replacementText: '[R3]',
        };
      },
    };

    // Shared budget across all rules is 4
    const result = detect('some sufficiently long test text for scanning', {
      rules: [rule1, rule2, rule3],
      maxFindings: 4,
    });

    expect(result.status).toBe('limit_exceeded');
    expect(result.findings.length).toBe(0);
    expect(result.limitDetails).toEqual({
      reason: 'too_many_findings',
      limit: 4,
      actual: 5,
    });
    // Rule 1 generated all 3 candidates
    expect(rule1Count).toBe(3);
    // Rule 2 generated 2 candidates (4th accepted, 5th triggered limit)
    expect(rule2Count).toBe(2);
    // Rule 3 was never invoked
    expect(rule3Called).toBe(false);
  });

  it('executes rules and resolves overlaps into clean findings result', () => {
    const text = 'prefix ghp_syntheticDummyKey123 suffix';
    const syntheticPattern = 'ghp_syntheticDummyKey123';

    const testRule: DetectorRule = {
      id: 'synthetic_github_pat_classic',
      category: 'github_pat_classic',
      *detect(src: string) {
        const idx = src.indexOf(syntheticPattern);
        if (idx !== -1) {
          yield {
            id: `github_pat_classic_${idx}`,
            category: 'github_pat_classic',
            range: { start: idx, end: idx + syntheticPattern.length },
            mask: 'ghp_••••••••',
            replacementText: '[REDACTED_GITHUB_PAT]',
          };
        }
      },
    };

    const result = detect(text, { rules: [testRule] });

    expect(result.status).toBe('findings');
    expect(result.findings.length).toBe(1);
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;

    expect(finding.category).toBe('github_pat_classic');
    expect(finding.mask).toBe('ghp_••••••••');
    expect(finding.replacementText).toBe('[REDACTED_GITHUB_PAT]');
    expect(finding.range).toEqual({
      start: 7,
      end: 7 + syntheticPattern.length,
    });

    // Verify Zero Secret Retention: The raw secret string must not exist on the finding object
    const findingKeys = Object.keys(finding);
    expect(findingKeys.includes('rawSecret')).toBe(false);
    expect(findingKeys.includes('secret')).toBe(false);
    expect(findingKeys.includes('value')).toBe(false);
  });

  describe('Issue #15: Range Validation & Safe Failure Handling', () => {
    it('rejects detection with failed status when candidate range is empty (start === end)', () => {
      const emptyRangeRule: DetectorRule = {
        id: 'empty_range_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'err_1',
            category: 'mock_cat',
            range: { start: 5, end: 5 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const result = detect('test string here', { rules: [emptyRangeRule] });
      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({ reason: 'invalid_range' });
    });

    it('rejects detection when candidate range has negative start offset', () => {
      const negativeStartRule: DetectorRule = {
        id: 'negative_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'err_neg',
            category: 'mock_cat',
            range: { start: -2, end: 4 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const result = detect('test string here', { rules: [negativeStartRule] });
      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({ reason: 'invalid_range' });
    });

    it('rejects detection when candidate range is out-of-bounds (end > text.length)', () => {
      const oobRule: DetectorRule = {
        id: 'oob_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'err_oob',
            category: 'mock_cat',
            range: { start: 2, end: 9999 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const result = detect('short text', { rules: [oobRule] });
      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({ reason: 'invalid_range' });
    });

    it('rejects detection when candidate range splits a surrogate pair', () => {
      // '🚀' is located at index 4 and 5
      const text = 'test🚀token';
      const surrogateSplitRule: DetectorRule = {
        id: 'split_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'err_split',
            category: 'mock_cat',
            range: { start: 5, end: 8 }, // start: 5 splits '🚀'
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const result = detect(text, { rules: [surrogateSplitRule] });
      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({ reason: 'invalid_range' });
    });

    it('does NOT allow an invalid range to be absorbed by overlap resolution with a valid range', () => {
      const validRule: DetectorRule = {
        id: 'valid_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'valid_1',
            category: 'mock_cat',
            range: { start: 0, end: 10 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const invalidOverlapRule: DetectorRule = {
        id: 'invalid_overlap_rule',
        category: 'mock_cat',
        *detect() {
          // Range has start > end, which could otherwise be silently covered by [0, 10)
          yield {
            id: 'invalid_1',
            category: 'mock_cat',
            range: { start: 8, end: 4 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
        },
      };

      const result = detect('hello world string', {
        rules: [validRule, invalidOverlapRule],
      });

      // Entire detection MUST fail, not absorb the invalid range!
      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({ reason: 'invalid_range' });
    });

    it('safely handles rule runtime exceptions without leaking source or exception details', () => {
      const sensitiveSecret = 'SUPER_SECRET_PAYLOAD_12345';
      const crashingRule: DetectorRule = {
        id: 'crashing_rule',
        category: 'mock_cat',
        detect(src: string) {
          throw new Error(`Crash with sensitive text: ${src}`);
        },
      };

      const result = detect(`User secret is: ${sensitiveSecret}`, {
        rules: [crashingRule],
      });

      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({
        reason: 'rule_execution_failed',
      });

      // Verify no sensitive payload in serialized result
      const serialized = JSON.stringify(result);
      expect(serialized.includes(sensitiveSecret)).toBe(false);
      expect(serialized.includes('Crash with sensitive text')).toBe(false);
    });

    it('safely handles generator-yield runtime exceptions', () => {
      const throwingGeneratorRule: DetectorRule = {
        id: 'generator_throw_rule',
        category: 'mock_cat',
        *detect() {
          yield {
            id: 'ok_1',
            category: 'mock_cat',
            range: { start: 0, end: 3 },
            mask: '••••',
            replacementText: '[REDACTED]',
          };
          throw new TypeError('Unexpected generator failure');
        },
      };

      const result = detect('some normal input', {
        rules: [throwingGeneratorRule],
      });

      expect(result.status).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.failureDetails).toEqual({
        reason: 'rule_execution_failed',
      });
    });
  });
});
