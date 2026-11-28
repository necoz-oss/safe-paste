import type { ReplacementResult } from '../adapter/replacement';
import { getCategoryLabel, getMaskedPreview } from './preview';
import { BANNER_CSS } from './theme';
import type { WarningBannerHandle, WarningBannerOptions } from './types';

// Tracks the current active banner for each editor to prevent duplicates
const activeBanners = new WeakMap<HTMLTextAreaElement, WarningBannerHandle>();

function isHorizontalOrTextareaWrapper(element: HTMLElement): boolean {
  const tag = element.tagName?.toUpperCase();
  if (tag === 'SPAN') {
    return true;
  }

  if (typeof element.className === 'string' && /Textarea|TextArea/i.test(element.className)) {
    return true;
  }

  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element);
    if (
      style.display === 'inline' ||
      style.display === 'inline-block' ||
      style.display === 'inline-flex'
    ) {
      return true;
    }
    if (
      style.display === 'flex' &&
      style.flexDirection !== 'column' &&
      style.flexDirection !== 'column-reverse'
    ) {
      return true;
    }
  }

  return false;
}

function resolveMountLocation(
  editor: HTMLTextAreaElement,
  explicitContainer?: HTMLElement
): { mountTarget: HTMLElement | null; referenceNode: Node | null } {
  if (explicitContainer) {
    return {
      mountTarget: explicitContainer,
      referenceNode: editor.parentElement === explicitContainer ? editor.nextSibling : null,
    };
  }

  let anchor: HTMLElement = editor;
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = anchor.parentElement;
    if (!parent) {
      break;
    }
    const parentTag = parent.tagName?.toUpperCase();
    if (parentTag === 'BODY' || parentTag === 'HTML') {
      break;
    }
    if (!isHorizontalOrTextareaWrapper(parent)) {
      return {
        mountTarget: parent,
        referenceNode: anchor.nextSibling,
      };
    }
    anchor = parent;
  }

  return {
    mountTarget: anchor.parentElement,
    referenceNode: anchor.nextSibling,
  };
}

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
  let errorTimerId: ReturnType<typeof setTimeout> | undefined;

  // 2. Build DOM elements purely using createElement and textContent
  const banner = doc.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-atomic', 'true');
  banner.setAttribute('data-safepaste-banner', 'true');
  const styles = doc.createElement('style');
  styles.textContent = BANNER_CSS;
  banner.appendChild(styles);

  // The title is present immediately; CSS only clips its visual presentation.
  const header = doc.createElement('div');
  header.setAttribute('class', 'sp-header');
  const heading = doc.createElement('div');
  heading.setAttribute('class', 'sp-heading');

  // Lucide Shield Alert, ISC licensed; see THIRD_PARTY_NOTICES.md.
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'sp-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10', 'M12 8v4', 'M12 16h.01']) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    icon.appendChild(path);
  }

  const headerTitle = doc.createElement('span');
  headerTitle.setAttribute('class', 'sp-title');
  headerTitle.textContent = 'Potential secret detected';
  const brand = doc.createElement('span');
  brand.setAttribute('class', 'sp-brand');
  brand.textContent = 'SafePaste';
  const count = session.findings.length;
  heading.appendChild(icon);
  heading.appendChild(headerTitle);
  header.appendChild(heading);
  header.appendChild(brand);
  banner.appendChild(header);

  // 2.2 Findings list (category + masked preview)
  const findingsList = doc.createElement('ul');
  findingsList.setAttribute('class', 'sp-findings');

  for (const finding of session.findings) {
    const item = doc.createElement('li');

    const categoryBadge = doc.createElement('span');
    categoryBadge.setAttribute('class', 'sp-category');
    categoryBadge.textContent = getCategoryLabel(finding.category);

    const separator = doc.createTextNode(' · ');

    const codePreview = doc.createElement('code');
    codePreview.textContent = getMaskedPreview(finding);

    item.appendChild(categoryBadge);
    item.appendChild(separator);
    item.appendChild(codePreview);
    findingsList.appendChild(item);
  }
  banner.appendChild(findingsList);

  // 2.3 Best-effort disclaimer
  const disclaimer = doc.createElement('div');
  disclaimer.setAttribute('class', 'sp-disclaimer');
  disclaimer.textContent =
    'Detection is best-effort. Review your content before submitting.';
  banner.appendChild(disclaimer);

  // 2.4 Status message area (for validation/stale errors)
  const statusArea = doc.createElement('div');
  statusArea.setAttribute('aria-live', 'assertive');
  statusArea.setAttribute('class', 'sp-error');
  statusArea.style.display = 'none';
  banner.appendChild(statusArea);

  // 2.5 Action buttons
  const actions = doc.createElement('div');
  actions.setAttribute('class', 'sp-actions');

  const redactBtn = doc.createElement('button');
  redactBtn.type = 'button';
  redactBtn.setAttribute('class', 'sp-redact');
  redactBtn.textContent = 'Redact';
  redactBtn.setAttribute(
    'aria-label',
    `Redact ${count} sensitive token${count === 1 ? '' : 's'} from editor`
  );

  const dismissBtn = doc.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.setAttribute('class', 'sp-dismiss');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss warning');

  actions.appendChild(redactBtn);
  actions.appendChild(dismissBtn);
  banner.appendChild(actions);

  // 3. Mount in DOM (outside horizontal/inline textarea wrappers so editing width is preserved)
  const { mountTarget, referenceNode } = resolveMountLocation(editor, options.container);
  if (mountTarget) {
    if (referenceNode) {
      mountTarget.insertBefore(banner, referenceNode);
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

    if (errorTimerId !== undefined) {
      clearTimeout(errorTimerId);
      errorTimerId = undefined;
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
        errorTimerId = setTimeout(handleDismiss, 4000);
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
