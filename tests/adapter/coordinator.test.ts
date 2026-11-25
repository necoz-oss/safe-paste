import { describe, expect, it } from 'vitest';
import { PasteSessionCoordinator } from '../../src/adapter/coordinator';
import type { PasteSessionInfo } from '../../src/adapter/session';
import type { DetectionResult } from '../../src/core/types';

function createMockEditor(initialValue = ''): HTMLTextAreaElement {
  const events: Event[] = [];
  const state = {
    tagName: 'TEXTAREA',
    name: 'issue[body]',
    value: initialValue,
    selectionStart: initialValue.length,
    selectionEnd: initialValue.length,
    isConnected: true,
    setSelectionRange(start: number, end: number) {
      state.selectionStart = start;
      state.selectionEnd = end;
    },
    dispatchEvent(event: Event) {
      events.push(event);
      return true;
    },
    _events: events,
  };
  return state as unknown as HTMLTextAreaElement;
}

function createMockPasteEvent(
  target: unknown,
  pastedText: string,
  isTrusted = true
): { event: ClipboardEvent; preventDefaultCalled: boolean } {
  let preventDefaultCalled = false;
  const event = {
    isTrusted,
    target,
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? pastedText : ''),
    },
    preventDefault() {
      preventDefaultCalled = true;
    },
    stopPropagation() {},
  } as unknown as ClipboardEvent;

  return { event, preventDefaultCalled };
}

const waitForDeferredTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Adapter: PasteSessionCoordinator', () => {
  it('processes trusted paste on supported editor without calling preventDefault and yields safe sessionInfo', async () => {
    const editor = createMockEditor('Header: ');
    editor.selectionStart = 8;
    editor.selectionEnd = 8;

    const mockFindings = [
      {
        id: 'f1',
        category: 'github_pat_classic' as const,
        range: { start: 0, end: 12 },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED_PAT]',
      },
    ];

    let detectCallCount = 0;
    const mockDetect = (text: string): DetectionResult => {
      detectCallCount++;
      if (text.includes('secret')) {
        return {
          status: 'findings',
          findings: mockFindings,
        };
      }
      return { status: 'clean', findings: [] };
    };

    let sessionInfoReceived: PasteSessionInfo | null = null;
    const coordinator = new PasteSessionCoordinator({
      detectFn: mockDetect,
      onFindings: (sessionInfo) => {
        sessionInfoReceived = sessionInfo;
      },
    });

    const pastedText = 'secret_token_123';
    const { event, preventDefaultCalled } = createMockPasteEvent(editor, pastedText, true);

    // Native browser updates editor value after paste event returns
    coordinator.handlePasteEvent(event);
    expect(preventDefaultCalled).toBe(false);

    // Detection is deferred and not yet called synchronously during event capture
    expect(detectCallCount).toBe(0);

    // Simulate native paste insertion in editor
    editor.value = `Header: ${pastedText}`;

    // Wait for macrotask insertion verification
    await waitForDeferredTask();

    expect(detectCallCount).toBe(1);
    expect(sessionInfoReceived).not.toBeNull();
    // Consumer receives safe metadata only (no raw secrets or snapshot strings)
    expect(sessionInfoReceived!.sessionId).toMatch(/^session_\d+_\d+$/);
    expect(sessionInfoReceived!.editor).toBe(editor);
    expect(sessionInfoReceived!.findings).toEqual(mockFindings);
    expect(sessionInfoReceived).not.toHaveProperty('pastedText');
    expect(sessionInfoReceived).not.toHaveProperty('snapshotValue');

    const session = coordinator.getActiveSession(editor);
    expect(session).toBeDefined();
    expect(session?.status).toBe('active');
    expect(session?.targetRange).toEqual({ start: 8, end: 8 + pastedText.length });
    expect(session?.snapshotValue).toBe(`Header: ${pastedText}`);

    // Now execute redaction using sessionInfo
    if (sessionInfoReceived) {
      const redactResult = coordinator.executeRedaction(sessionInfoReceived);
      expect(redactResult.success).toBe(true);
      expect(editor.value).toBe('Header: [REDACTED_PAT]_123');
      expect(session?.status).toBe('redacted');
      // Sensitive data must be cleared from the session upon redaction completion
      expect(session?.pastedText).toBe('');
      expect(session?.snapshotValue).toBe('');
    }
  });

  it('immediately invalidates and disposes previous session upon a new paste even if the new paste has no findings', async () => {
    const editor = createMockEditor('');
    const mockFindings = [
      {
        id: 'f1',
        category: 'github_pat_classic' as const,
        range: { start: 0, end: 6 },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED]',
      },
    ];

    const coordinator = new PasteSessionCoordinator({
      detectFn: (text) =>
        text.includes('secret')
          ? { status: 'findings', findings: mockFindings }
          : { status: 'clean', findings: [] },
    });

    // 1st paste: with secret
    const { event: event1 } = createMockPasteEvent(editor, 'secret1');
    coordinator.handlePasteEvent(event1);
    editor.value = 'secret1';
    editor.selectionStart = 7;
    editor.selectionEnd = 7;
    await waitForDeferredTask();

    const session1 = coordinator.getActiveSession(editor);
    expect(session1?.status).toBe('active');
    expect(session1?.pastedText).toBe('secret1');

    // 2nd paste: clean paste with no findings
    const { event: event2 } = createMockPasteEvent(editor, 'clean text');
    coordinator.handlePasteEvent(event2); // New paste starts immediately

    // Session 1 must be immediately dismissed and its sensitive data cleared synchronously on paste
    expect(session1?.status).toBe('dismissed');
    expect(session1?.pastedText).toBe('');
    expect(session1?.snapshotValue).toBe('');

    editor.value = 'secret1clean text';
    await waitForDeferredTask();

    // Since 2nd paste was clean, no new session should be active
    expect(coordinator.getActiveSession(editor)).toBeUndefined();
  });

  it('notifies onSessionInvalidated callback when an active session is invalidated by a new paste', async () => {
    const editor = createMockEditor('');
    const invalidated: { id: string; editor: HTMLTextAreaElement }[] = [];

    const mockFindings = [
      {
        id: 'f1',
        category: 'github_pat_classic' as const,
        range: { start: 0, end: 12 },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED]',
      },
    ];

    const coordinator = new PasteSessionCoordinator({
      detectFn: (text) =>
        text.includes('secret')
          ? { status: 'findings', findings: mockFindings }
          : { status: 'clean', findings: [] },
      onSessionInvalidated: (id, ed) => {
        invalidated.push({ id, editor: ed });
      },
    });

    const { event: event1 } = createMockPasteEvent(editor, 'secret');
    coordinator.handlePasteEvent(event1);
    editor.value = 'secret';
    await waitForDeferredTask();

    const session = coordinator.getActiveSession(editor);
    expect(session).toBeDefined();
    const sessionId = session!.id;
    expect(invalidated.length).toBe(0);

    // Subsequent clean paste immediately invalidates prior session
    const { event: event2 } = createMockPasteEvent(editor, 'clean text');
    coordinator.handlePasteEvent(event2);

    expect(invalidated.length).toBe(1);
    expect(invalidated[0]?.id).toBe(sessionId);
    expect(invalidated[0]?.editor).toBe(editor);
  });

  it('cancels pending paste callback if another paste occurs before macrotask executes', async () => {
    const editor = createMockEditor('');
    let detectCalls = 0;
    const coordinator = new PasteSessionCoordinator({
      detectFn: () => {
        detectCalls++;
        return { status: 'clean', findings: [] };
      },
    });

    const { event: event1 } = createMockPasteEvent(editor, 'fast1');
    coordinator.handlePasteEvent(event1);

    // Immediately paste again before macrotask resolves
    const { event: event2 } = createMockPasteEvent(editor, 'fast2');
    coordinator.handlePasteEvent(event2);

    editor.value = 'fast2';
    await waitForDeferredTask();

    // Only the second paste's deferred callback runs
    expect(detectCalls).toBe(1);
  });

  it('safely rejects session creation if actual inserted content does not match expected value', async () => {
    const editor = createMockEditor('Existing content');
    editor.selectionStart = 8;
    editor.selectionEnd = 8;

    let onFindingsCalled = false;
    const coordinator = new PasteSessionCoordinator({
      detectFn: () => ({
        status: 'findings',
        findings: [
          {
            id: 'f1',
            category: 'github_pat_classic',
            range: { start: 0, end: 5 },
            mask: 'ghp_••••••••',
            replacementText: '[REDACTED]',
          },
        ],
      }),
      onFindings: () => {
        onFindingsCalled = true;
      },
    });

    const { event } = createMockPasteEvent(editor, 'secret', true);
    coordinator.handlePasteEvent(event);

    // Simulate external transformation or cancellation by GitHub/extension:
    editor.value = 'Existing[transformed] content';

    await waitForDeferredTask();

    expect(onFindingsCalled).toBe(false);
    expect(coordinator.getActiveSession(editor)).toBeUndefined();
  });

  it('ensures only the currently active session can execute redaction', async () => {
    const editor = createMockEditor('');
    let capturedSessionInfo: PasteSessionInfo | null = null;
    const coordinator = new PasteSessionCoordinator({
      detectFn: () => ({
        status: 'findings',
        findings: [
          {
            id: 'f1',
            category: 'github_pat_classic',
            range: { start: 0, end: 6 },
            mask: 'ghp_••••••••',
            replacementText: '[REDACTED]',
          },
        ],
      }),
      onFindings: (info) => {
        capturedSessionInfo = info;
      },
    });

    const { event } = createMockPasteEvent(editor, 'secret');
    coordinator.handlePasteEvent(event);
    editor.value = 'secret';
    await waitForDeferredTask();

    expect(capturedSessionInfo).not.toBeNull();

    // Dismiss the session
    coordinator.dismissSession(capturedSessionInfo!.sessionId);

    // Attempting redaction on a dismissed session must be safely rejected
    const redactResult = coordinator.executeRedaction(capturedSessionInfo!.sessionId);
    expect(redactResult.success).toBe(false);
    if (!redactResult.success) {
      expect(redactResult.reason).toBe('invalid_status');
    }
  });

  it('ignores untrusted (programmatic) paste events', async () => {
    const editor = createMockEditor('');
    let onFindingsCalled = false;
    const coordinator = new PasteSessionCoordinator({
      onFindings: () => {
        onFindingsCalled = true;
      },
    });

    const { event } = createMockPasteEvent(editor, 'secret', false); // isTrusted: false
    coordinator.handlePasteEvent(event);
    await waitForDeferredTask();

    expect(onFindingsCalled).toBe(false);
    expect(coordinator.getActiveSession(editor)).toBeUndefined();
  });

  it('ignores unsupported elements (e.g. input fields)', async () => {
    const inputElement = {
      tagName: 'INPUT',
      name: 'issue[title]',
    };

    let onFindingsCalled = false;
    const coordinator = new PasteSessionCoordinator({
      onFindings: () => {
        onFindingsCalled = true;
      },
    });

    const { event } = createMockPasteEvent(inputElement, 'secret', true);
    coordinator.handlePasteEvent(event);
    await waitForDeferredTask();

    expect(onFindingsCalled).toBe(false);
  });
});
