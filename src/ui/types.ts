import type { ReplacementResult } from '../adapter/replacement';
import type { PasteSessionInfo } from '../adapter/session';

export interface WarningBannerOptions {
  readonly session: PasteSessionInfo;
  readonly onRedact: (session: PasteSessionInfo) => ReplacementResult | void;
  readonly onDismiss?: (session: PasteSessionInfo) => void;
  /** Custom document for dependency injection / testing */
  readonly doc?: Document;
  /** Custom container element where the banner will be mounted */
  readonly container?: HTMLElement;
  /** Milliseconds after which banner auto-dismisses if inactive (default: 60s) */
  readonly autoDismissMs?: number;
}

export interface WarningBannerHandle {
  readonly element: HTMLElement;
  readonly isMounted: () => boolean;
  readonly dismiss: () => void;
}
