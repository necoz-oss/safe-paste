# Privacy and Safety Requirements (MVP)

This document defines the trust boundaries, data lifecycle, security constraints, and release verification checklist for **SafePaste**, addressing [Issue #7](https://github.com/necoz-oss/safe-paste/issues/7).

SafePaste is designed around a simple, transparent principle:
> **SafePaste is a local-first, privacy-respecting client helper. It never phones home, never persists your text, and never stores secrets.**

---

## 1. Trust Boundaries & Platform Constraints

### 1.1 Strict Manifest & Permission Boundaries
- **Minimal Manifest Execution:** SafePaste requests **zero** API permissions in its Manifest V3 configuration (`public/manifest.json`).
  - No `storage` or `unlimitedStorage`
  - No `clipboardRead` or `clipboardWrite`
  - No `webRequest`, `declarativeNetRequest`, or broad network permissions
  - No `nativeMessaging`, `identity`, or background service workers
- **Restricted Host Surface:** Content scripts are strictly restricted to `https://github.com/*`.
- **Isolated World Execution:** Content scripts run in Chrome's `ISOLATED` world (`"world": "ISOLATED"`), preventing direct interference from page scripts or third-party web code.
- **Zero Remote Code:** In strict adherence to Chrome MV3 guidelines, all code is statically bundled and shipped with the extension. Dynamic evaluation (`eval`, `new Function`, external script injection) is prohibited.

### 1.2 Zero Network & External Telemetry
- SafePaste initiates **zero** network requests:
  - No `fetch()`, `XMLHttpRequest`, or `WebSocket` connections
  - No analytics, metrics, tracking beacons (`navigator.sendBeacon`), or telemetry SDKs
  - No external crash reporting or remote API calls
- All scanning and redaction logic runs purely in-memory on the user's local machine.

---

## 2. In-Memory Data Lifecycle & Zero Secret Retention

### 2.1 Transient Lifecycle
- SafePaste operates strictly in transient volatile memory.
- **No Persistent Storage:** SafePaste never writes to `localStorage`, `sessionStorage`, `indexedDB`, browser cookies, or `chrome.storage`.
- **Session Expiration:** A `PasteSession` exists only as long as necessary for the user to review the finding:
  - **Fixed TTL:** Automatically expires and becomes inactive after 60 seconds (default TTL).
  - **Superseding Paste:** Any subsequent paste into the same editor immediately invalidates and cleans up the prior session.
  - **Explicit Dismissal:** Clicking `[Dismiss]` or pressing `Escape` immediately unmounts the UI and transitions the session to `dismissed`.
  - **Editor Detachment:** If the editor is unmounted or navigating away, references are dereferenced (using `WeakMap` where applicable) for immediate garbage collection.

### 2.2 Zero Secret Retention Principle
- The raw matched secret string is **never** retained in downstream data structures:
  - `Finding` objects only store rule categories (`category`), numeric offsets (`range: [start, end)`), safe presentation masks (`mask: "ghp_••••••••"`), and replacement text (`replacementText`).
  - The Native UI layer renders only category badges and fixed-width masked strings. Raw secret characters are never duplicated or rendered in the DOM.
- **Zero Secret-Bearing Logs:** Internal debug or operational logs never log raw clipboard text or matched substrings.

---

## 3. Real-World Security Guarantees & User Responsibilities

SafePaste provides assistive safety checks; it does not claim to offer guaranteed security or replace standard operational security practices:

### 3.1 Pasted Text Still Reaches GitHub's Editor
- SafePaste uses a **non-intrusive, capture-phase listener** that does *not* prevent or block native browser pasting.
- Consequently, pasted text lands in GitHub's `<textarea>` natively before redaction is applied:
  - GitHub's local editor listeners (such as draft autosave or local history) receive the pasted text upon paste.
  - Applying redaction safely substitutes the text in the editor via native range replacement and dispatches an `input` event to re-sync GitHub's preview and draft state.
  - If a secret is pasted, it must still be redacted *before* the issue, pull request, or comment is published or submitted.

### 3.2 Detection is Best-Effort
- Regex and heuristic scanners are inherently best-effort:
  - Tokens split across lines, obfuscated, encoded (e.g. Base64), or novel token formats may not be flagged.
  - SafePaste minimizes false positives for targeted formats, but users must always manually review pasted text prior to publishing.

### 3.3 Redaction ≠ Credential Revocation
- **Important:** Redacting a token from a text box does **not** revoke the token on GitHub:
  - If a live secret was accidentally submitted, posted, or committed, editing the comment or running redaction does not secure the account.
  - Any exposed credential must be immediately revoked and rotated in [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens).

---

## 4. Synthetic Test Data Policy

To prevent credential leakage in source code, CI logs, or public repositories:
- **Strict Prohibition:** Real, active, expired, or revoked production credentials are strictly banned from all test fixtures, mock data, unit tests, and documentation.
- **Synthetic Format Compliance:** All test fixtures must use synthetic, non-functional tokens matching the structural format (e.g. `ghp_` followed by randomly generated alphanumeric characters or `github_pat_` followed by mock characters).

---

## 5. Lightweight Release Verification Checklist

Maintainers and contributors must verify each item before tagging or publishing any release:

- [ ] **Manifest Permissions:**
  - Verify `public/manifest.json` specifies `"manifest_version": 3`.
  - Verify `"matches"` is strictly limited to `["https://github.com/*"]`.
  - Verify no `permissions`, `optional_permissions`, `host_permissions`, or `background` fields exist.
- [ ] **Network & Storage Surface:**
  - Run static checks confirming zero references to `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, or `chrome.storage`.
- [ ] **DOM & Injection Safety:**
  - Verify zero usage of `.innerHTML` or `.insertAdjacentHTML` with unescaped variables.
  - Verify content script runs in `"world": "ISOLATED"`.
- [ ] **Secret Disclosure & Logging:**
  - Confirm `console.log` / `console.info` calls do not output pasted text or detected secret substrings.
  - Confirm UI rendering only uses masked strings (`ghp_••••••••`).
- [ ] **Synthetic Test Verification:**
  - Confirm all test suites pass (`npm run check`) and no real credentials exist in `tests/`.
- [ ] **Bundle Audit:**
  - Inspect `dist/content-script.js` to ensure Vite did not introduce external network polyfills, telemetry, or unvetted third-party runtime code.
