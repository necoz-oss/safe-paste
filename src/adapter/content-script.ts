import { mountWarningBanner } from '../ui';
import { PasteSessionCoordinator } from './coordinator';

/**
 * Initializes SafePaste on GitHub pages:
 * 1. Attaches a non-blocking capture-phase paste listener on document.
 * 2. Runs pure client-side detection over pasted plaintext.
 * 3. Mounts an accessible warning banner when findings are present.
 * 4. Enables one-click safe redaction without modifying GitHub textarea rendering.
 */
export function initSafePaste(): () => void {
  const coordinator = new PasteSessionCoordinator({
    onFindings: (session) => {
      mountWarningBanner({
        session,
        onRedact: (activeSession) => coordinator.executeRedaction(activeSession),
        onDismiss: (activeSession) => coordinator.dismissSession(activeSession),
      });
    },
  });

  const listener = (event: Event) => {
    coordinator.handlePasteEvent(event as ClipboardEvent);
  };

  document.addEventListener('paste', listener, { capture: true });

  return () => {
    document.removeEventListener('paste', listener, { capture: true });
  };
}

// Auto-initialize when running inside the browser content script
if (typeof document !== 'undefined') {
  initSafePaste();
}
