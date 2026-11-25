import { detect } from '../core/detect';
import { redact } from '../core/redact';
import type { DetectionResult, RedactionResult } from '../core/types';
import { extractPastedPlaintext, isSupportedGitHubEditor, isTrustedEvent } from './editor';
import { applyRedactionToEditor, type ReplacementResult } from './replacement';
import {
  createPasteSession,
  disposePasteSession,
  type PasteSession,
  type PasteSessionInfo,
  type SessionStatus,
} from './session';

export interface AdapterOptions {
  readonly root?: Document | HTMLElement;
  readonly detectFn?: (text: string) => DetectionResult;
  readonly redactFn?: (text: string, targets: Parameters<typeof redact>[1]) => RedactionResult;
  readonly onFindings?: (sessionInfo: PasteSessionInfo) => void;
  readonly onSessionInvalidated?: (sessionId: string, editor: HTMLTextAreaElement) => void;
}

export type SessionTarget =
  | string
  | HTMLTextAreaElement
  | PasteSession
  | PasteSessionInfo;

export class PasteSessionCoordinator {
  private readonly activeSessions = new WeakMap<HTMLTextAreaElement, PasteSession>();
  private readonly sessionsById = new Map<string, PasteSession>();
  private readonly pendingTimeouts = new WeakMap<HTMLTextAreaElement, ReturnType<typeof setTimeout>>();
  private readonly sessionTtlTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly detectFn: (text: string) => DetectionResult;
  private readonly redactFn: (text: string, targets: Parameters<typeof redact>[1]) => RedactionResult;
  private readonly onFindings: ((sessionInfo: PasteSessionInfo) => void) | undefined;
  private readonly onSessionInvalidated: ((sessionId: string, editor: HTMLTextAreaElement) => void) | undefined;

  constructor(options: AdapterOptions = {}) {
    this.detectFn = options.detectFn ?? detect;
    this.redactFn = options.redactFn ?? redact;
    this.onFindings = options.onFindings;
    this.onSessionInvalidated = options.onSessionInvalidated;
  }

  public getActiveSession(editor: HTMLTextAreaElement): PasteSession | undefined {
    return this.activeSessions.get(editor);
  }

  public getSessionById(sessionId: string): PasteSession | undefined {
    return this.sessionsById.get(sessionId);
  }

  /**
   * Centralized disposal helper: cancels timers, removes session mappings,
   * transitions status, notifies invalidation listeners, and clears sensitive in-memory strings.
   */
  public disposeSession(session: PasteSession, status: SessionStatus = 'dismissed'): void {
    const wasActive = session.status === 'active';
    const ttlTimer = this.sessionTtlTimeouts.get(session.id);
    if (ttlTimer !== undefined) {
      clearTimeout(ttlTimer);
      this.sessionTtlTimeouts.delete(session.id);
    }

    this.sessionsById.delete(session.id);
    if (this.activeSessions.get(session.editor) === session) {
      this.activeSessions.delete(session.editor);
    }

    disposePasteSession(session, status);

    if (wasActive && typeof this.onSessionInvalidated === 'function') {
      this.onSessionInvalidated(session.id, session.editor);
    }
  }

  public handlePasteEvent(event: ClipboardEvent): void {
    // 1. Validate user-initiated trusted event
    if (!isTrustedEvent(event)) {
      return;
    }

    const target = event.target;
    // 2. Validate supported GitHub editor
    if (!isSupportedGitHubEditor(target)) {
      return;
    }

    const editor: HTMLTextAreaElement = target;

    // 3. Centralized immediate invalidation on new supported paste:
    // Any new paste immediately cancels pending callbacks and invalidates prior sessions on this editor.
    const pendingTimer = this.pendingTimeouts.get(editor);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      this.pendingTimeouts.delete(editor);
    }

    const existingSession = this.activeSessions.get(editor);
    if (existingSession) {
      this.disposeSession(existingSession, 'dismissed');
    }

    // 4. Extract plaintext without blocking or modifying native paste
    const pastedText = extractPastedPlaintext(event);
    if (!pastedText) {
      return;
    }

    // 5. Capture pre-paste editor state
    const prePasteValue = editor.value;
    const preSelectionStart = editor.selectionStart ?? 0;
    const preSelectionEnd = editor.selectionEnd ?? preSelectionStart;

    // 6. Defer verification and detection until after native browser insertion finishes
    const timer = setTimeout(() => {
      this.pendingTimeouts.delete(editor);

      // If editor was detached or replaced during paste, abort
      if (typeof editor.isConnected === 'boolean' && !editor.isConnected) {
        return;
      }

      // Verify the exact expected insertion before creating a session
      const expectedValue =
        prePasteValue.slice(0, preSelectionStart) +
        pastedText +
        prePasteValue.slice(preSelectionEnd);

      if (editor.value !== expectedValue) {
        return;
      }

      // Run detection over verified pasted plaintext
      const detection = this.detectFn(pastedText);
      if (detection.status !== 'findings' || detection.findings.length === 0) {
        return;
      }

      const targetRange = {
        start: preSelectionStart,
        end: preSelectionStart + pastedText.length,
      };

      // Create new session
      const session = createPasteSession({
        editor,
        pastedText,
        targetRange,
        snapshotValue: expectedValue,
        findings: detection.findings,
      });

      this.activeSessions.set(editor, session);
      this.sessionsById.set(session.id, session);

      // Schedule automated TTL expiration and disposal
      const ttlTimer = setTimeout(() => {
        this.disposeSession(session, 'expired');
      }, session.ttlMs);
      this.sessionTtlTimeouts.set(session.id, ttlTimer);

      // Notify consumer / UI with safe metadata only (no raw secrets or full snapshots)
      if (typeof this.onFindings === 'function') {
        const sessionInfo: PasteSessionInfo = {
          sessionId: session.id,
          editor: session.editor,
          findings: session.findings,
        };
        this.onFindings(sessionInfo);
      }
    }, 0);

    this.pendingTimeouts.set(editor, timer);
  }

  private resolveSession(target: SessionTarget): PasteSession | undefined {
    if (typeof target === 'string') {
      return this.sessionsById.get(target);
    }
    if (typeof (target as HTMLTextAreaElement).tagName === 'string') {
      return this.activeSessions.get(target as HTMLTextAreaElement);
    }
    if (typeof (target as PasteSessionInfo).sessionId === 'string') {
      return this.sessionsById.get((target as PasteSessionInfo).sessionId);
    }
    if (typeof (target as PasteSession).id === 'string') {
      return this.sessionsById.get((target as PasteSession).id);
    }
    return undefined;
  }

  /**
   * Executes redaction for an active session. Ensures that only the currently active
   * session can perform redaction and releases sensitive data immediately upon completion.
   */
  public executeRedaction(target: SessionTarget, now?: number): ReplacementResult {
    const session = this.resolveSession(target);

    // Validate that session exists, is active, and is the current active session for its editor
    if (
      !session ||
      session.status !== 'active' ||
      this.activeSessions.get(session.editor) !== session
    ) {
      if (session) {
        this.disposeSession(session, session.status);
      }
      return {
        success: false,
        reason: 'invalid_status',
        error: 'The redaction session is no longer active.',
      };
    }

    const redactionTargets = session.findings.map((f) => ({
      range: f.range,
      replacementText: f.replacementText,
    }));

    const redaction = this.redactFn(session.pastedText, redactionTargets);
    if (!redaction.success) {
      this.disposeSession(session, 'stale');
      return {
        success: false,
        reason: 'stale',
        error: `Core redaction failed: ${redaction.error}`,
      };
    }

    const result = applyRedactionToEditor(session, redaction.text, now);

    // Release sensitive data immediately upon completion (success or error)
    this.disposeSession(session, result.success ? 'redacted' : 'stale');

    return result;
  }

  /**
   * Dismisses an active session and immediately clears retained sensitive data.
   */
  public dismissSession(target: SessionTarget): void {
    const session = this.resolveSession(target);
    if (session) {
      this.disposeSession(session, 'dismissed');
    }
  }
}

/**
 * Initializes global delegated paste handling on document.
 */
export function initPasteAdapter(options: AdapterOptions = {}): () => void {
  const coordinator = new PasteSessionCoordinator(options);
  const root = options.root ?? document;

  const listener = (event: Event) => {
    coordinator.handlePasteEvent(event as ClipboardEvent);
  };

  root.addEventListener('paste', listener, { capture: true });

  return () => {
    root.removeEventListener('paste', listener, { capture: true });
  };
}
