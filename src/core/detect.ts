import { resolveOverlaps } from './overlap';
import { validateRange } from './range';
import { defaultMvpRules } from './rules/github_pat';
import type {
  DetectionResult,
  DetectOptions,
  Finding,
} from './types';

export const DEFAULT_MAX_INPUT_LENGTH = 102_400; // ~100 KiB UTF-16 code units
export const DEFAULT_MAX_FINDINGS = 50;

/**
 * Pure orchestrator function to execute detector rules against an input string.
 * Enforces input budgets, caps findings count, validates candidate ranges,
 * safely handles rule execution failures, and deterministically resolves overlaps.
 */
export function detect(
  text: string,
  options: DetectOptions = {}
): DetectionResult {
  const maxInputLength = options.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;

  // Check input length budget
  if (text.length > maxInputLength) {
    return {
      status: 'limit_exceeded',
      findings: [],
      limitDetails: {
        reason: 'input_too_large',
        limit: maxInputLength,
        actual: text.length,
      },
    };
  }

  // Handle empty input directly
  if (text.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  const rules = options.rules ?? defaultMvpRules;
  if (rules.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  const rawFindings: Finding[] = [];

  for (const rule of rules) {
    try {
      for (const finding of rule.detect(text)) {
        // Issue #15: Validate candidate range before overlap resolution
        const validation = validateRange(finding.range, text);
        if (!validation.valid) {
          return {
            status: 'failed',
            findings: [],
            failureDetails: {
              reason: 'invalid_range',
            },
          };
        }

        if (rawFindings.length >= maxFindings) {
          return {
            status: 'limit_exceeded',
            findings: [],
            limitDetails: {
              reason: 'too_many_findings',
              limit: maxFindings,
              actual: maxFindings + 1,
            },
          };
        }
        rawFindings.push(finding);
      }
    } catch {
      // Issue #15: Rule execution failure must return safe failure without leaking sensitive input
      return {
        status: 'failed',
        findings: [],
        failureDetails: {
          reason: 'rule_execution_failed',
        },
      };
    }
  }

  const resolved = resolveOverlaps(rawFindings);

  if (resolved.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  return {
    status: 'findings',
    findings: resolved,
  };
}
