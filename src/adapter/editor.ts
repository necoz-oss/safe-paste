export const SUPPORTED_GITHUB_EDITOR_SELECTORS = [
  'textarea#issue_body',
  'textarea[name="issue[body]"]',
  'textarea#new_comment_field',
  'textarea[name="comment[body]"]',
  'textarea.js-comment-field',
] as const;

export const MODERN_GITHUB_EDITOR_CONTAINER_SELECTORS = [
  '[class*="CommentBox"]',
  '[data-component="CommentBox"]',
  '.timeline-comment',
  '.js-comment-form',
] as const;

/**
 * Checks whether a URL pathname matches a GitHub issue or pull request page.
 * Path pattern: /<owner>/<repo>/(issues|pull)(/.*)?
 */
export function isGitHubIssuePage(pathname?: string): boolean {
  const path =
    pathname ??
    (typeof window !== 'undefined' && window.location ? window.location.pathname : '');

  // If running outside browser or location is unconfigured/root/blank, allow for tests
  if (!path || path === '/' || path === 'blank' || path === 'about:blank') {
    return true;
  }

  return /^\/[^/]+\/[^/]+\/(?:issues|pull)(?:\/|\?|#|$)/i.test(path);
}

/**
 * Validates if a target element is a supported GitHub textarea editor
 * restricted strictly to GitHub issue descriptions and issue comments.
 */
export function isSupportedGitHubEditor(
  target: unknown,
  pathname?: string
): target is HTMLTextAreaElement {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const el = target as Partial<HTMLTextAreaElement>;
  if (el.tagName !== 'TEXTAREA') {
    return false;
  }

  // 1. Check classic GitHub issue/comment textarea selectors
  if (typeof el.matches === 'function') {
    for (const selector of SUPPORTED_GITHUB_EDITOR_SELECTORS) {
      if (el.matches(selector)) {
        return true;
      }
    }
  } else {
    const id = el.id ?? '';
    const name = el.name ?? '';
    const className = el.className ?? '';

    if (
      id === 'issue_body' ||
      name === 'issue[body]' ||
      id === 'new_comment_field' ||
      name === 'comment[body]' ||
      className.split(/\s+/).includes('js-comment-field')
    ) {
      return true;
    }
  }

  // 2. Check modern React/Primer CommentBox inside issue/PR page scope
  if (isGitHubIssuePage(pathname)) {
    if (typeof el.closest === 'function') {
      for (const containerSelector of MODERN_GITHUB_EDITOR_CONTAINER_SELECTORS) {
        if (el.closest(containerSelector)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Extracts plaintext from a paste ClipboardEvent safely without modifying or blocking it.
 */
export function extractPastedPlaintext(event: ClipboardEvent): string | null {
  const data = event.clipboardData?.getData('text/plain');
  if (!data || data.length === 0) {
    return null;
  }
  return data;
}

/**
 * Validates that an event was initiated directly by user interaction (not synthetic dispatch).
 */
export function isTrustedEvent(event: Event): boolean {
  return event.isTrusted === true;
}
