import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasteSessionInfo } from '../../src/adapter/session';
import type { Finding } from '../../src/core/types';
import {
  dismissWarningBanner,
  hasActiveWarningBanner,
  mountWarningBanner,
} from '../../src/ui/banner';
import { createMockDocument, MockElement } from './helpers/mock-dom';

function createMockEditor(parent: MockElement): HTMLTextAreaElement {
  const editor = new MockElement('textarea');
  parent.appendChild(editor);
  return editor as unknown as HTMLTextAreaElement;
}

const mockFindingClassic: Finding = {
  id: 'f1',
  category: 'github_pat_classic',
  range: { start: 0, end: 40 },
  mask: 'ghp_••••••••',
  replacementText: '[REDACTED: github_pat]',
};

const mockFindingFineGrained: Finding = {
  id: 'f2',
  category: 'github_pat_fine_grained',
  range: { start: 50, end: 143 },
  mask: 'github_pat_••••••••',
  replacementText: '[REDACTED: github_pat]',
};

const mockFindings: readonly Finding[] = [mockFindingClassic, mockFindingFineGrained];

function createMockSessionInfo(
  editor: HTMLTextAreaElement,
  findings: readonly Finding[] = mockFindings,
  id = 'session_mock_1'
): PasteSessionInfo {
  return {
    sessionId: id,
    editor,
    findings,
  };
}

describe('UI Banner: mountWarningBanner', () => {
  let doc: Document;
  let container: MockElement;
  let editor: HTMLTextAreaElement;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = createMockDocument();
    container = new MockElement('div');
    editor = createMockEditor(container);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts non-blocking warning banner with accessible attributes and findings', () => {
    const session = createMockSessionInfo(editor, mockFindings);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
    });

    expect(handle.isMounted()).toBe(true);

    const bannerElem = handle.element as unknown as MockElement;
    expect(bannerElem.getAttribute('role')).toBe('alert');
    expect(bannerElem.getAttribute('aria-live')).toBe('polite');
    expect(bannerElem.getAttribute('data-safepaste-banner')).toBe('true');

    // Verify children elements are mounted in container
    expect(container.children).toContain(bannerElem);

    // Verify header title mentions finding count
    expect(bannerElem.textContent).toContain('2 sensitive tokens detected in paste');

    // Verify category labels and masks are present
    expect(bannerElem.textContent).toContain('GitHub Personal Access Token (Classic)');
    expect(bannerElem.textContent).toContain('ghp_••••••••');
    expect(bannerElem.textContent).toContain('GitHub Personal Access Token (Fine-grained)');
    expect(bannerElem.textContent).toContain('github_pat_••••••••');

    // Verify disclaimer
    expect(bannerElem.textContent).toContain('Detection is best-effort');

    // Verify Redact and Dismiss buttons exist
    const buttons = bannerElem.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.textContent).toBe('Redact');
    expect(buttons[1]?.textContent).toBe('Dismiss');
  });

  it('executes onRedact and unmounts banner upon clicking Redact button', () => {
    const onRedact = vi.fn().mockReturnValue({ success: true, newText: 'redacted' });
    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact,
    });

    const bannerElem = handle.element as unknown as MockElement;
    const redactBtn = bannerElem.querySelectorAll('button')[0];
    expect(redactBtn).toBeDefined();

    redactBtn!.dispatchEvent({ type: 'click', isTrusted: true });

    expect(onRedact).toHaveBeenCalledTimes(1);
    expect(onRedact).toHaveBeenCalledWith(session);
    expect(handle.isMounted()).toBe(false);
    expect(container.children).not.toContain(bannerElem);
  });

  it('ignores untrusted (synthetic) click events on Redact button', () => {
    const onRedact = vi.fn();
    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact,
    });

    const bannerElem = handle.element as unknown as MockElement;
    const redactBtn = bannerElem.querySelectorAll('button')[0];
    expect(redactBtn).toBeDefined();

    redactBtn!.dispatchEvent({ type: 'click', isTrusted: false });
    redactBtn!.dispatchEvent({ type: 'click' });

    expect(onRedact).not.toHaveBeenCalled();
    expect(handle.isMounted()).toBe(true);
  });

  it('displays error message and disables button if onRedact returns a failure', () => {
    const onRedact = vi.fn().mockReturnValue({
      success: false,
      reason: 'stale',
      error: 'The editor content has changed.',
    });

    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact,
    });

    const bannerElem = handle.element as unknown as MockElement;
    const redactBtn = bannerElem.querySelectorAll('button')[0];
    expect(redactBtn).toBeDefined();

    redactBtn!.dispatchEvent({ type: 'click', isTrusted: true });

    expect(onRedact).toHaveBeenCalledTimes(1);
    expect(bannerElem.textContent).toContain('The editor content has changed.');
    expect(redactBtn!.disabled).toBe(true);
    expect(handle.isMounted()).toBe(true);

    // Fast-forward auto-dismiss timer on error
    vi.advanceTimersByTime(4000);
    expect(handle.isMounted()).toBe(false);
  });

  it('calls onDismiss and unmounts upon clicking Dismiss button', () => {
    const onDismiss = vi.fn();
    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
      onDismiss,
    });

    const bannerElem = handle.element as unknown as MockElement;
    const dismissBtn = bannerElem.querySelectorAll('button')[1];
    expect(dismissBtn).toBeDefined();

    dismissBtn!.dispatchEvent({ type: 'click' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(session);
    expect(handle.isMounted()).toBe(false);
    expect(container.children).not.toContain(bannerElem);
  });

  it('dismisses banner when Escape key is pressed on document', () => {
    const onDismiss = vi.fn();
    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
      onDismiss,
    });

    (doc as unknown as MockElement).dispatchEvent({ type: 'keydown', key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(handle.isMounted()).toBe(false);
  });

  it('replaces existing banner when a new banner is mounted on the same editor', () => {
    const session1 = createMockSessionInfo(editor, [mockFindingClassic], 's1');
    const session2 = createMockSessionInfo(editor, [mockFindingFineGrained], 's2');

    const handle1 = mountWarningBanner({
      session: session1,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
    });

    expect(handle1.isMounted()).toBe(true);

    const handle2 = mountWarningBanner({
      session: session2,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
    });

    // First banner must be cleanly unmounted
    expect(handle1.isMounted()).toBe(false);
    expect(handle2.isMounted()).toBe(true);
    expect(
      container.children.filter((c) => c.getAttribute('data-safepaste-banner') === 'true').length
    ).toBe(1);
  });

  it('auto-dismisses after autoDismissMs delay', () => {
    const onDismiss = vi.fn();
    const session = createMockSessionInfo(editor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      container: container as unknown as HTMLElement,
      onRedact: vi.fn(),
      onDismiss,
      autoDismissMs: 5000,
    });

    expect(handle.isMounted()).toBe(true);

    vi.advanceTimersByTime(5000);

    expect(handle.isMounted()).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('dismissWarningBanner & hasActiveWarningBanner lifecycle', () => {
    it('dismisses active warning banner by editor reference and returns status', () => {
      const onDismiss = vi.fn();
      const session = createMockSessionInfo(editor, [mockFindingClassic]);

      expect(hasActiveWarningBanner(editor)).toBe(false);
      expect(dismissWarningBanner(editor)).toBe(false);

      const handle = mountWarningBanner({
        session,
        doc,
        container: container as unknown as HTMLElement,
        onRedact: vi.fn(),
        onDismiss,
      });

      expect(hasActiveWarningBanner(editor)).toBe(true);
      expect(handle.isMounted()).toBe(true);

      const dismissed = dismissWarningBanner(editor);
      expect(dismissed).toBe(true);
      expect(hasActiveWarningBanner(editor)).toBe(false);
      expect(handle.isMounted()).toBe(false);
      expect(container.children).not.toContain(handle.element as unknown as MockElement);
      expect(onDismiss).toHaveBeenCalledTimes(1);

      // Calling dismissWarningBanner again when unmounted returns false
      expect(dismissWarningBanner(editor)).toBe(false);
    });
  });

  it('mounts banner outside Primer span/Textarea wrapper to preserve editor width', () => {
    const commentBox = new MockElement('div');
    const textareaWrapper = new MockElement('span') as MockElement & { className?: string };
    textareaWrapper.className = 'prc-Textarea-TextAreaWrapper-xyz';
    const footer = new MockElement('div');

    commentBox.appendChild(textareaWrapper);
    commentBox.appendChild(footer);

    const wrappedEditor = createMockEditor(textareaWrapper);
    const session = createMockSessionInfo(wrappedEditor, [mockFindingClassic]);

    const handle = mountWarningBanner({
      session,
      doc,
      onRedact: vi.fn(),
    });

    const bannerElem = handle.element as unknown as MockElement;
    expect(textareaWrapper.children).not.toContain(bannerElem);
    expect(commentBox.children).toEqual([textareaWrapper, bannerElem, footer]);
  });
});
