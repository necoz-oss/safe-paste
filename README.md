# SafePaste

A small, local-first browser extension to help developers notice potential sensitive information pasted into GitHub issues and comments. 😺🔎

SafePaste has a development scaffold; product features are not implemented yet. The planned Chrome MVP detects potential GitHub personal access tokens in pasted text, shows non-blocking warnings, and lets users explicitly redact them. Detection is best-effort; always review your text before posting.

Read the [MVP scope and draft architecture](docs/design.md) and join the review in [Issue #1](https://github.com/necoz-oss/safe-paste/issues/1) before implementation begins.

A Necoz community project: **Small. Simple. Useful.**

## Development

Use Node.js 22.12 or newer (Node 22 is used in CI; `.nvmrc` selects that line) and npm.

```sh
npm ci
npm run check
```

`npm ci` installs the committed lockfile. Keep `package-lock.json` in version control when changing development dependencies. There are no runtime dependencies; TypeScript checks types, Vite bundles the content script, and Vitest runs tests.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict checks, including a Core check without DOM or Node ambient types |
| `npm test` | Run tests once |
| `npm run test:watch` | Rerun tests during development |
| `npm run build` | Produce the unpacked extension in `dist/` |
| `npm run dev` | Rebuild on source changes; no server or hot reload client |
| `npm run check` | Run type checks, tests, and build, as in CI |

## Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this repository's `dist/` directory. Confirm SafePaste loads without errors.
4. Open or refresh a `https://github.com/` page. The scaffold is intentionally inert: no detection, warnings, redaction, or paste handling exists yet.
5. After rebuilding, click **Reload** on SafePaste's extension card and refresh the GitHub page. Restart the watch command after changing build configuration or the manifest if needed.

Only `https://github.com/*` is matched. The manifest requests no additional API permissions and has no background worker. A site-access notice for GitHub is expected. See Chrome's [unpacked extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Privacy and safety

SafePaste is designed around strict privacy and safety requirements:
- **No Network Requests:** SafePaste initiates zero outbound network traffic, telemetry, analytics, or external API calls.
- **No Persistent Storage:** No storage permissions, cookies, `localStorage`, or `chrome.storage`. All operations run in transient memory with a 60-second session TTL.
- **Zero Secret Retention:** Downstream finding data structures and UI never retain or render raw secrets in the DOM, using fixed-width masks (`ghp_••••••••`).
- **Best-Effort & Non-Blocking:** Native paste is unhindered; detection is best-effort. Redacting text in a form field does not revoke a compromised credential on GitHub.

Read the complete [Privacy and Safety Requirements](docs/privacy-and-safety.md) and release verification checklist before contributing or releasing.

## Source boundaries

- `src/core/`: pure TypeScript; no browser, GitHub, UI, network, or storage dependencies. API design remains in [Issue #3](https://github.com/necoz-oss/safe-paste/issues/3).
- `src/adapter/content-script.ts`: GitHub entry point and future paste/session coordination; no detection rules.
- `src/ui/`: future native-DOM warnings; no detection or direct editor writes.
- `public/manifest.json`: copied into `dist/` alongside the bundled `content-script.js`.
- `tests/`: Vitest tests; initial tests guard the manifest's restricted execution and permission surface.

The extra Core type check removes ambient DOM/Node types; review must also enforce module boundaries and the ban on network/storage access. Use only synthetic, non-functional credentials in future tests. CI checks this scaffold; real GitHub editor behavior and the design's product acceptance criteria require later integration tests.
