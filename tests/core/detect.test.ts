import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detect';
import type { DetectorRule, TextRange } from '../../src/core/types';

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
      mask: 'mock_••••',
      replacementText: '[MOCK]',
      *detect() {
        for (let i = 0; i < 10; i++) {
          generatedCount++;
          yield { start: i * 2, end: i * 2 + 1 };
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
      mask: 'mock_••••',
      replacementText: '[MOCK]',
      *detect() {
        for (let i = 0; i < 5; i++) {
          generatedCount++;
          yield { start: i * 4, end: i * 4 + 2 };
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
      mask: 'm1_••••',
      replacementText: '[R1]',
      *detect() {
        for (let i = 0; i < 3; i++) {
          rule1Count++;
          yield { start: i * 2, end: i * 2 + 1 };
        }
      },
    };

    const rule2: DetectorRule = {
      id: 'rule2',
      category: 'cat2',
      mask: 'm2_••••',
      replacementText: '[R2]',
      *detect() {
        for (let i = 0; i < 3; i++) {
          rule2Count++;
          yield { start: 10 + i * 2, end: 10 + i * 2 + 1 };
        }
      },
    };

    const rule3: DetectorRule = {
      id: 'rule3',
      category: 'cat3',
      mask: 'm3_••••',
      replacementText: '[R3]',
      *detect() {
        rule3Called = true;
        yield { start: 30, end: 35 };
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
      mask: 'ghp_••••••••',
      replacementText: '[REDACTED_GITHUB_PAT]',
      *detect(src: string) {
        const idx = src.indexOf(syntheticPattern);
        if (idx !== -1) {
          yield { start: idx, end: idx + syntheticPattern.length };
        }
      },
    };

    const result = detect(text, { rules: [testRule] });

    expect(result.status).toBe('findings');
    expect(result.findings.length).toBe(1);
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;

    expect(finding.id).toBe(`synthetic_github_pat_classic_7_${7 + syntheticPattern.length}`);
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: 5, end: 5 };
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: -2, end: 4 };
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: 2, end: 9999 };
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: 5, end: 8 }; // start: 5 splits '🚀'
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: 0, end: 10 };
        },
      };

      const invalidOverlapRule: DetectorRule = {
        id: 'invalid_overlap_rule',
        category: 'mock_cat',
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          // Range has start > end, which could otherwise be silently covered by [0, 10)
          yield { start: 8, end: 4 };
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
        mask: '••••',
        replacementText: '[REDACTED]',
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
        mask: '••••',
        replacementText: '[REDACTED]',
        *detect() {
          yield { start: 0, end: 3 };
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

  describe('Issue #16: Centralized Finding Metadata Generation', () => {
    it('constructs findings centrally from rule descriptors and does not forward rogue properties', () => {
      // Simulate a rogue or buggy rule that attaches raw tokens or secret properties to yielded objects
      const rogueRule: DetectorRule = {
        id: 'rogue_token_rule',
        category: 'rogue_category',
        mask: 'rogue_••••••••',
        replacementText: '[REDACTED_ROGUE]',
        *detect(): Iterable<TextRange> {
          const matchedRange = {
            start: 5,
            end: 15,
            // Rogue extra properties that must NOT leak into the Finding object
            rawSecret: 'TOP_SECRET_TOKEN_VALUE',
            extractedToken: 'TOP_SECRET_TOKEN_VALUE',
            customMask: 'LEAKED_MASK',
          };
          yield matchedRange as unknown as TextRange;
        },
      };

      const text = 'prefix1234567890suffix';
      const result = detect(text, { rules: [rogueRule] });

      expect(result.status).toBe('findings');
      expect(result.findings.length).toBe(1);

      const finding = result.findings[0]!;
      // Expected schema fields only
      expect(finding).toEqual({
        id: 'rogue_token_rule_5_15',
        category: 'rogue_category',
        range: { start: 5, end: 15 },
        mask: 'rogue_••••••••',
        replacementText: '[REDACTED_ROGUE]',
      });

      // Assert exact keys on Finding object
      expect(Object.keys(finding).sort()).toEqual([
        'category',
        'id',
        'mask',
        'range',
        'replacementText',
      ]);
      expect(Object.keys(finding.range).sort()).toEqual(['end', 'start']);

      // Assert serialized detection result does not contain raw secrets or rogue property names
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('rawSecret');
      expect(serialized).not.toContain('extractedToken');
      expect(serialized).not.toContain('LEAKED_MASK');
      expect(serialized).not.toContain('TOP_SECRET_TOKEN_VALUE');
    });

    it('guarantees IDs and masks are static and never derived from raw secret content', () => {
      const secret1 = 'FIRST_SECRET_TOKEN_VALUE';
      const secret2 = 'SECOND_SECRET_TOKEN_VALUE';
      const text = `${secret1} and ${secret2}`;

      const rule: DetectorRule = {
        id: 'fixed_rule',
        category: 'fixed_cat',
        mask: 'fixed_••••••••',
        replacementText: '[REDACTED_FIXED]',
        *detect(src: string): Iterable<TextRange> {
          const idx1 = src.indexOf(secret1);
          if (idx1 !== -1) yield { start: idx1, end: idx1 + secret1.length };
          const idx2 = src.indexOf(secret2);
          if (idx2 !== -1) yield { start: idx2, end: idx2 + secret2.length };
        },
      };

      const result = detect(text, { rules: [rule] });
      expect(result.status).toBe('findings');
      expect(result.findings.length).toBe(2);

      // Verify deterministic ID format: ${rule.id}_${start}_${end}
      expect(result.findings[0]!.id).toBe(`fixed_rule_0_${secret1.length}`);
      expect(result.findings[1]!.id).toBe(`fixed_rule_${secret1.length + 5}_${text.length}`);

      // Verify masks are identical and source-independent
      expect(result.findings[0]!.mask).toBe('fixed_••••••••');
      expect(result.findings[1]!.mask).toBe('fixed_••••••••');
    });

    it('preserves deterministic overlap resolution and merged IDs when findings overlap', () => {
      const ruleA: DetectorRule = {
        id: 'rule_a',
        category: 'cat_a',
        mask: 'a_••••',
        replacementText: '[REDACTED_A]',
        *detect(): Iterable<TextRange> {
          yield { start: 5, end: 15 };
        },
      };

      const ruleB: DetectorRule = {
        id: 'rule_b',
        category: 'cat_b',
        mask: 'b_••••',
        replacementText: '[REDACTED_B]',
        *detect(): Iterable<TextRange> {
          yield { start: 10, end: 20 };
        },
      };

      const text = '01234567890123456789012345';
      const result = detect(text, { rules: [ruleA, ruleB] });

      expect(result.status).toBe('findings');
      expect(result.findings.length).toBe(1);

      const merged = result.findings[0]!;
      expect(merged.range).toEqual({ start: 5, end: 20 });
      expect(merged.id).toBe('rule_a_5_15+rule_b_10_20');
      expect(merged.category).toBe('cat_a');
      expect(merged.mask).toBe('a_••••');
      expect(merged.replacementText).toBe('[REDACTED_A]');
    });
  });
});
