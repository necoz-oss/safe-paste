# RFC 0006: Non-Blocking Warning & Redaction Preview UI

- **Status:** Proposed
- **Author:** johnnylemonny (Webilo)
- **Related Issue:** [#6](https://github.com/necoz-oss/safe-paste/issues/6)
- **Related Proposals:** [RFC 0003](docs/proposals/0003-core-detection-and-redaction-api.md) (PR #9), [RFC 0005](docs/proposals/0005-paste-adapter-and-replacement.md) (PR #12)

---

## 1. Summary

This proposal specifies the design and implementation of SafePaste's **Native UI** layer (`src/ui/`), addressing [Issue #6](https://github.com/necoz-oss/safe-paste/issues/6).

The UI layer provides a frictionless, non-blocking notification banner positioned near the relevant GitHub editor only when pasted content contains detected sensitive tokens. It presents masked previews without exposing secrets in the DOM, offers accessible one-click redaction and dismissal, and cleanly manages its lifecycle without any UI framework dependencies.

---

## 2. Key Design Invariants

### 2.1 Frictionless & Non-Blocking Experience
- The warning banner mounts directly adjacent to the active GitHub textarea (inserted as the next sibling within the form or container).
- It never blocks normal typing, tab navigation, or form submission:
  - No modal backdrops, dialogs, or focus-stealing traps.
  - Normal pasting and issue/PR commenting remain fully functional at all times.
- Clearly communicates that detection is best-effort:
  > *"Detection is best-effort. Normal paste and posting remain available; always review your content before submitting."*

### 2.2 Zero Raw Secret Exposure & Safe DOM Rendering
- In adherence to the **Zero Secret Retention** principle:
  - Downstream DOM nodes never receive, display, or duplicate raw secret strings.
  - The UI displays human-readable category badges (e.g., `GitHub Personal Access Token (Classic)`) and safe masked previews (e.g., `ghp_••••••••`).
  - Preview masking uses fixed bullet lengths to avoid leaking exact secret character counts.
- **Strict DOM Safety:**
  - Constructed exclusively using native DOM APIs (`createElement`, `setAttribute`, `textContent`, `appendChild`).
  - No `innerHTML` or `insertAdjacentHTML` with unescaped text, ensuring total immunity against XSS or markup injection.
  - Zero third-party UI framework dependencies, keeping bundle footprint minimal (~12 kB unminified, < 4.5 kB gzip).

### 2.3 Accessibility & Keyboard Controls
- The banner element includes `role="alert"`, `aria-live="polite"`, and `aria-atomic="true"`, ensuring assistive technologies announce findings without disrupting the user's ongoing typing.
- Both `[Redact]` and `[Dismiss]` are native `<button type="button">` elements included naturally in keyboard tab order.
- Supports dismissal via the `Escape` key.
- Distinct focus outlines and contrast compliant with WCAG 2.1 AA across light and dark modes.

### 2.4 Theme Adaptation (Light & Dark Mode)
- Styled using GitHub Primer CSS custom properties (`--bgColor-attention-muted`, `--borderColor-attention-muted`, `--fgColor-default`, `--button-primary-bgColor-rest`).
- Includes resilient inline style fallbacks for standard amber/neutral styling if Primer variables are unavailable.
- Blends natively into GitHub's UI without stylesheet injection conflicts.

### 2.5 Lifecycle & Stale Protection
- **Single Banner per Editor:** Mounting a new banner on an editor immediately unmounts any existing active banner for that editor, preventing duplicate stacked alerts on consecutive pastes.
- **One-Click Redact:**
  - Clicking `[Redact]` invokes the adapter's `executeRedaction(session)`.
  - On success, the banner cleanly unmounts.
  - If editor content changed after paste, the stale condition is surfaced clearly:
    > *"The editor content has changed. SafePaste could not apply the redaction. Please review your text manually or paste it again."*
    The banner highlights the warning with `aria-live="assertive"` and automatically unmounts after 4 seconds.
- **Dismissal & Expiration:**
  - Clicking `[Dismiss]` or pressing `Escape` removes the banner and updates the session state to `dismissed`.
  - Automatically unmounts when the session TTL expires (default: 60s).
