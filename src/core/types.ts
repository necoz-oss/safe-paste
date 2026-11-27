/**
 * Represents a zero-indexed, half-open interval [start, end) in UTF-16 code units.
 * Exactly matches JavaScript string indexing (String.prototype.slice) and
 * HTMLTextAreaElement selection boundaries (textarea.selectionStart / selectionEnd).
 */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Finding categories representing types of detected sensitive information.
 * Extensible for future categories while strictly typing MVP targets.
 */
export type FindingCategory =
  | 'github_pat_classic'
  | 'github_pat_fine_grained'
  | (string & {});

/**
 * Metadata for a detected sensitive value.
 *
 * NOTE: The raw matched secret string is deliberately NOT stored here
 * to satisfy the Zero Secret Retention principle. The caller holds the
 * transient source text in memory; downstream consumers (Adapter/UI)
 * only receive offsets, category, safe presentation mask, and replacement text.
 */
export interface Finding {
  readonly id: string;
  readonly category: FindingCategory;
  readonly range: TextRange;
  readonly mask: string;
  readonly replacementText: string;
}

/**
 * Status of detection execution.
 */
export type DetectionStatus =
  | 'clean'
  | 'findings'
  | 'limit_exceeded'
  | 'failed';

/**
 * Details provided when a processing budget or cap is reached.
 */
export interface DetectionLimitDetails {
  readonly reason: 'input_too_large' | 'too_many_findings';
  readonly limit: number;
  readonly actual: number;
}

/**
 * Specific reason why detection failed.
 */
export type DetectionFailureReason =
  | 'invalid_range'
  | 'rule_execution_failed';

/**
 * Details provided when detection execution fails.
 * Deliberately excludes raw source content, stack traces, and exception details
 * to guarantee that sensitive information is never leaked.
 */
export interface DetectionFailureDetails {
  readonly reason: DetectionFailureReason;
}

/**
 * The deterministic outcome of running detection over an input string.
 */
export interface DetectionResult {
  readonly status: DetectionStatus;
  readonly findings: readonly Finding[];
  readonly limitDetails?: DetectionLimitDetails;
  readonly failureDetails?: DetectionFailureDetails;
}

/**
 * Static metadata defining how a detection rule presents findings.
 * Predefined and independent of runtime input or raw secrets.
 */
export interface DetectorRuleDescriptor {
  readonly id: string;
  readonly category: FindingCategory;
  readonly mask: string;
  readonly replacementText: string;
}

/**
 * A pure rule that scans a string and returns candidate UTF-16 code unit ranges.
 * The rule is NOT responsible for constructing Finding objects; Core constructs
 * public Finding metadata centrally from validated ranges and the rule's safe descriptor.
 */
export interface DetectorRule extends DetectorRuleDescriptor {
  detect(text: string): Iterable<TextRange>;
}

/**
 * Configuration options for the detect orchestrator.
 */
export interface DetectOptions {
  readonly rules?: readonly DetectorRule[];
  /** Maximum allowed input length in UTF-16 code units (default: 102,400 ~ 100 KiB) */
  readonly maxInputLength?: number;
  /** Maximum number of findings before halting detection (default: 50) */
  readonly maxFindings?: number;
}

/**
 * Target range and replacement text for a redaction operation.
 */
export interface RedactionTarget {
  readonly range: TextRange;
  readonly replacementText: string;
}

/**
 * Specific reasons why a redaction operation could be rejected.
 */
export type RedactionFailureReason =
  | 'invalid_range'
  | 'overlapping_targets'
  | 'surrogate_boundary_split';

/**
 * Discriminated union result of a redaction operation.
 */
export type RedactionResult =
  | {
      readonly success: true;
      readonly text: string;
      readonly appliedCount: number;
    }
  | {
      readonly success: false;
      readonly reason: RedactionFailureReason;
      readonly error: string;
    };
