import type { ReplacementResult } from '../adapter/replacement';
import { getCategoryLabel, getMaskedPreview } from './preview';
import { BANNER_STYLES } from './theme';
import type { WarningBannerHandle, WarningBannerOptions } from './types';

// Tracks the current active banner for each editor to prevent duplicates
const activeBanners = new WeakMap<HTMLTextAreaElement, WarningBannerHandle>();

/**
 * Creates and mounts a non-blocking warning banner near the target editor.
 * Renders findings with masked previews, provides one-click redact and dismiss,
 * and uses strictly safe DOM methods (zero innerHTML).
 */
export function mountWarningBanner(options: WarningBannerOptions): WarningBannerHandle {
  const { session, onRedact, onDismiss } = options;
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined);

  if (!doc) {
    throw new Error('SafePaste WarningBanner: Document is not available in the current environment.');
  }

  const editor = session.editor;

  // 1. Clean up any existing banner for this editor
  const existingHandle = activeBanners.get(editor);
  if (existingHandle && existingHandle.isMounted()) {
    existingHandle.dismiss();
  }

  let mounted = true;
  let timerId: ReturnType<typeof setTimeout> | undefined;

  // 2. Build DOM elements purely using createElement and textContent
  const banner = doc.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-atomic', 'true');
  banner.setAttribute('data-safepaste-banner', 'true');
  banner.style.cssText = BANNER_STYLES.container;

  // 2.1 Header
  const header = doc.createElement('div');
  header.style.cssText = BANNER_STYLES.header;

  const headerIcon = doc.createElement('span');
  headerIcon.setAttribute('aria-hidden', 'true');
  headerIcon.textContent = '🛡️';

  const headerTitle = doc.createElement('span');
  const count = session.findings.length;
  headerTitle.textContent = `SafePaste: ${count} sensitive token${count === 1 ? '' : 's'} detected in paste`;

  header.appendChild(headerIcon);
  header.appendChild(headerTitle);
  banner.appendChild(header);

  // 2.2 Findings list (category + masked preview)
  const findingsList = doc.createElement('ul');
  findingsList.style.cssText = BANNER_STYLES.findingsList;

  for (const finding of session.findings) {
    const item = doc.createElement('li');
    item.style.marginBottom = '4px';

    const categoryBadge = doc.createElement('span');
    categoryBadge.style.cssText = BANNER_STYLES.badge;
    categoryBadge.textContent = getCategoryLabel(finding.category);

    const separator = doc.createTextNode(' ');

    const codePreview = doc.createElement('code');
    codePreview.style.cssText = BANNER_STYLES.codePreview;
    codePreview.textContent = getMaskedPreview(finding);

    item.appendChild(categoryBadge);
    item.appendChild(separator);
    item.appendChild(codePreview);
    findingsList.appendChild(item);
  }
  banner.appendChild(findingsList);

  // 2.3 Best-effort disclaimer
  const disclaimer = doc.createElement('div');
  disclaimer.style.cssText = BANNER_STYLES.disclaimer;
  disclaimer.textContent =
    'Detection is best-effort. Normal paste and posting remain available; always review your content before submitting.';
  banner.appendChild(disclaimer);

  // 2.4 Status message area (for validation/stale errors)
  const statusArea = doc.createElement('div');
  statusArea.setAttribute('aria-live', 'assertive');
  statusArea.style.cssText = BANNER_STYLES.statusError;
  statusArea.style.display = 'none';
  banner.appendChild(statusArea);

  // 2.5 Action buttons
  const actions = doc.createElement('div');
  actions.style.cssText = BANNER_STYLES.actions;

  const redactBtn = doc.createElement('button');
  redactBtn.type = 'button';
  redactBtn.style.cssText = BANNER_STYLES.buttonRedact;
  redactBtn.textContent = 'Redact';
  redactBtn.setAttribute(
    'aria-label',
    `Redact ${count} sensitive token${count === 1 ? '' : 's'} from editor`
  );

  const dismissBtn = doc.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.style.cssText = BANNER_STYLES.buttonDismiss;
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss warning');

  actions.appendChild(redactBtn);
  actions.appendChild(dismissBtn);
  banner.appendChild(actions);

  // 3. Mount in DOM
  const mountTarget = options.container ?? editor.parentElement;
  if (mountTarget) {
    if (editor.nextSibling && editor.parentElement === mountTarget) {
      mountTarget.insertBefore(banner, editor.nextSibling);
    } else {
      mountTarget.appendChild(banner);
    }
  }

  // 4. Teardown / Dismiss logic
  const handleDismiss = () => {
    if (!mounted) {
      return;
    }
    mounted = false;

    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }

    doc.removeEventListener('keydown', onDocumentKeyDown);

    if (banner.parentElement) {
      banner.parentElement.removeChild(banner);
    }

    if (activeBanners.get(editor) === handle) {
      activeBanners.delete(editor);
    }

    if (typeof onDismiss === 'function') {
      onDismiss(session);
    }
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && mounted) {
      handleDismiss();
    }
  };

  doc.addEventListener('keydown', onDocumentKeyDown);

  // 5. Button event handlers
  redactBtn.addEventListener('click', (event: Event) => {
    if (!mounted || !event.isTrusted) {
      return;
    }

    try {
      const result = onRedact(session);
      // If a replacement result was returned and failed, display the reason
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        const failure = result as Extract<ReplacementResult, { success: false }>;
        statusArea.textContent = failure.error;
        statusArea.style.display = 'block';
        redactBtn.disabled = true;
        // Auto-dismiss after brief feedback
        setTimeout(handleDismiss, 4000);
        return;
      }

      handleDismiss();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to apply redaction';
      statusArea.textContent = message;
      statusArea.style.display = 'block';
      redactBtn.disabled = true;
    }
  });

  dismissBtn.addEventListener('click', () => {
    handleDismiss();
  });

  // 6. Schedule auto-dismiss when session TTL expires (default: 60s)
  const autoDismissDelay = options.autoDismissMs ?? 60_000;
  if (autoDismissDelay > 0 && autoDismissDelay !== Infinity) {
    timerId = setTimeout(handleDismiss, autoDismissDelay);
  }

  const handle: WarningBannerHandle = {
    element: banner,
    isMounted: () => mounted,
    dismiss: handleDismiss,
  };

  activeBanners.set(editor, handle);
  return handle;
}

/**
 * Dismisses and unmounts any currently active warning banner associated with the given editor.
 * Returns true if an active banner was dismissed, false otherwise.
 */
export function dismissWarningBanner(editor: HTMLTextAreaElement): boolean {
  const existingHandle = activeBanners.get(editor);
  if (existingHandle && existingHandle.isMounted()) {
    existingHandle.dismiss();
    return true;
  }
  return false;
}

/**
 * Returns whether a warning banner is currently mounted for the given editor.
 */
export function hasActiveWarningBanner(editor: HTMLTextAreaElement): boolean {
  const handle = activeBanners.get(editor);
  return handle !== undefined && handle.isMounted();
}
