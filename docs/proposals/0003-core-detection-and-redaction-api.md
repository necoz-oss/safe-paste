# RFC 0003: Pure TypeScript Core Detection and Redaction API

- **Status:** Proposed
- **Author:** johnnylemonny (Webilo)
- **Related Issue:** [#3](https://github.com/necoz-oss/safe-paste/issues/3)
- **Originating Discussion:** [Necoz Discussion #3](https://github.com/orgs/necoz-oss/discussions/3)
- **Related PRs:** [#8](https://github.com/necoz-oss/safe-paste/pull/8)

---

## 1. Summary

This proposal specifies the pure TypeScript API contract for SafePaste's `Core` module, addressing [Issue #3](https://github.com/necoz-oss/safe-paste/issues/3).

In accordance with Necoz's **Small. Simple. Useful. 😸** philosophy and the architectural constraints defined in `docs/design.md` (PR #8), the `Core` module is strictly isolated:
- Zero dependencies on DOM, Chrome Extension APIs, GitHub APIs, network, or persistent storage.
- Operates strictly on in-memory strings.
- Enforces the **Zero Secret Retention** principle: `Finding` metadata does NOT retain raw sensitive secrets.
- Uses exact **UTF-16 code units** for all string offsets to remain 100% compatible with JavaScript's `String.prototype.slice()` and HTML textarea `selectionStart`/`selectionEnd`.
- Provides deterministic sorting and greedy overlap resolution.
- Guarantees 100% byte-for-byte preservation of unredacted text fragments.
- Safely handles Unicode surrogate pairs, empty input, multiline text, adjacent matches, and invalid ranges without throwing unhandled exceptions.

---

## 2. API Types and Data Structures

### 2.1 Range Representation

String offsets are represented as zero-indexed, half-open intervals `[start, end)` in **UTF-16 code units**:

```typescript
export interface TextRange {
  readonly start: number;
  readonly end: number;
}
```

**Semantics & Invariants:**
1. `0 <= start <= end <= text.length`
2. `start` and `end` must be integers (`Number.isInteger()`).
3. JavaScript strings are UTF-16 sequences. Astral plane characters (such as emojis `🚀` or specific CJK ideographs) occupy two UTF-16 code units (a high surrogate `0xD800–0xDBFF` followed by a low surrogate `0xDC00–0xDFFF`).
4. A range must never slice between a high and low surrogate pair.

---

### 2.2 Finding & Category Metadata

```typescript
export type FindingCategory =
  | 'github_pat_classic'
  | 'github_pat_fine_grained'
  | (string & {});

export interface Finding {
  readonly id: string;
  readonly category: FindingCategory;
  readonly range: TextRange;
  readonly mask: string;
  readonly replacementText: string;
}
```

**Key Security Invariant: Zero Secret Retention in Metadata:**
The `Finding` object deliberately does **not** store the raw matched secret string. It contains only:
- A stable identifier within the detection result.
- The category for classification.
- The offset range `[start, end)` into the caller's transient source string.
- A fixed presentation mask (e.g., `'ghp_••••••••'`) that communicates the finding without disclosing length, entropy, or content.
- The standard redaction replacement text (e.g., `'[REDACTED_GITHUB_PAT]'`).

---

### 2.3 Detection Result, Budget Limits & Failure Safety

```typescript
export type DetectionStatus = 'clean' | 'findings' | 'limit_exceeded' | 'failed';

export interface DetectionLimitDetails {
  readonly reason: 'input_too_large' | 'too_many_findings';
  readonly limit: number;
  readonly actual: number;
}

export type DetectionFailureReason =
  | 'invalid_range'
  | 'rule_execution_failed';

export interface DetectionFailureDetails {
  readonly reason: DetectionFailureReason;
}

export interface DetectionResult {
  readonly status: DetectionStatus;
  readonly findings: readonly Finding[];
  readonly limitDetails?: DetectionLimitDetails;
  readonly failureDetails?: DetectionFailureDetails;
}
```

If an input exceeds the configured input budget (e.g. 100 KiB / 102,400 UTF-16 code units) or findings exceed a safe threshold, detection halts conservatively. In accordance with `docs/design.md`, incomplete or capped results must not be offered for automatic redaction to prevent partial/unsafe replacement.

**Range Validation & Safe Failure Boundary (Issue #15):**
- Candidate ranges returned by detector rules are validated before overlap resolution (`0 <= start < end <= text.length`, integer offsets, and surrogate-pair preservation).
- If any rule yields an invalid range (or an unhandled runtime exception is thrown during rule execution), detection immediately fails with `status: 'failed'`.
- Failed detection returns an empty findings list (`findings: []`) to prevent partial or corrupted redaction.
- Exception details and raw source snippets are strictly withheld from `failureDetails` to prevent credential exposure.

---

### 2.4 Detector Rules & Orchestrator

```typescript
export interface DetectorRuleDescriptor {
  readonly id: string;
  readonly category: FindingCategory;
  readonly mask: string;
  readonly replacementText: string;
}

export interface DetectorRule extends DetectorRuleDescriptor {
  detect(text: string): Iterable<TextRange>;
}

export interface DetectOptions {
  readonly rules?: readonly DetectorRule[];
  readonly maxInputLength?: number;
  readonly maxFindings?: number;
}

export function detect(text: string, options?: DetectOptions): DetectionResult;
```

**Centralized Finding Metadata Generation (Issue #16):**
- Rules are strictly responsible for yielding candidate `TextRange` intervals (`[start, end)`) matching their static patterns.
- Rules do NOT construct `Finding` objects.
- `Core` validates returned ranges and centrally constructs public `Finding` objects using only the rule's static descriptor and validated bounds:
  - `id`: Deterministic identifier `${rule.id}_${range.start}_${range.end}`
  - `category`: `rule.category`
  - `range`: `{ start: range.start, end: range.end }`
  - `mask`: `rule.mask`
  - `replacementText`: `rule.replacementText`
- Additional or unexpected runtime properties from rule return values are strictly discarded, guaranteeing Zero Secret Retention and preventing secret leakage into finding metadata.

---

### 2.5 Redaction Contract

```typescript
export interface RedactionTarget {
  readonly range: TextRange;
  readonly replacementText: string;
}

export type RedactionFailureReason =
  | 'invalid_range'
  | 'overlapping_targets'
  | 'surrogate_boundary_split';

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

export function redact(
  sourceText: string,
  targets: readonly RedactionTarget[]
): RedactionResult;
```

---

## 3. Algorithms & Determinism

### 3.1 Deterministic Overlap Resolution

When multiple rules produce findings on the same text, overlaps must be resolved deterministically:

1. **Sorting Order:**
   - Primary: `start` ascending (`a.range.start - b.range.start`).
   - Secondary (same start): longer match first (`b.range.end - a.range.end`). This prioritizes specific, full token matches over substring rules.
   - Tertiary (identical range): deterministic tie-breaker by `id` (`a.id.localeCompare(b.id)`).

2. **Deterministic Range Merging (Full Sensitive Coverage Guarantee):**
   - As established in `docs/design.md`, silently dropping overlapping findings (e.g. dropping `[30, 60)` when overlapping with `[10, 40)`) would leave `[40, 60)` unredacted.
   - Core guarantees that overlap resolution **never silently loses coverage** of any detected sensitive range:
     - If candidate starts before current range ends (`candidate.start < current.end`), the ranges are merged into `[current.start, max(current.end, candidate.end))`.
     - Contained ranges (e.g. `[15, 30)` inside `[10, 40)`) are fully subsumed.
     - Directly adjacent ranges (`[0, 5)` and `[5, 10)`) are preserved as distinct findings.
     - Transitive overlaps (`[10, 30)`, `[25, 45)`, `[40, 65)`) are continuously unified into `[10, 65)`.

### 3.2 Slice & Rebuild Redaction

To guarantee that all text outside the redacted ranges remains 100% byte-for-byte and char-for-char untouched:

1. Validate all target ranges (`0 <= start <= end <= sourceText.length`, integers, no surrogate splits).
2. Validate that targets are disjoint (`target[i].start >= target[i-1].end`).
3. Iterate sequentially from index `0`, copying unredacted slices and injecting replacement tokens:
   ```typescript
   let cursor = 0;
   let result = '';
   for (const target of sortedTargets) {
     result += sourceText.slice(cursor, target.range.start);
     result += target.replacementText;
     cursor = target.range.end;
   }
   result += sourceText.slice(cursor);
   ```

---

## 4. Test Matrix & Synthetic Fixtures

All contract tests use **exclusively synthetic, non-functional tokens**:
- `ghp_syntheticClassicDummyToken1234567890`
- `github_pat_syntheticFineGrainedDummyToken1234567890_abcdef`

**Test Cases Covered:**
1. Empty string (`""`) input.
2. Single match at start, middle, end, and full string.
3. Multiple disjoint matches.
4. Adjacent matches (`[0, 5)` and `[5, 10)`).
5. Overlapping match resolution (partial overlap and complete containment).
6. Multiline text, code blocks, JSON snippets, and Markdown formatting.
7. Multibyte Unicode and emojis (astral plane) with preservation of surrounding characters.
8. Rejection of invalid ranges (negative start, end > length, start > end, non-integers).
9. Rejection of surrogate pair splitting.
10. Input length limits and finding caps.
