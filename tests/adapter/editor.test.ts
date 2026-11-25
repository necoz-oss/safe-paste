import { describe, expect, it } from 'vitest';
import {
  isSupportedGitHubEditor,
  isGitHubIssuePage,
  extractPastedPlaintext,
  isTrustedEvent,
  SUPPORTED_GITHUB_EDITOR_SELECTORS,
  MODERN_GITHUB_EDITOR_CONTAINER_SELECTORS,
} from '../../src/adapter/editor';

describe('Adapter: Editor Recognition & Event Helpers', () => {
  describe('isGitHubIssuePage', () => {
    it('matches GitHub issue and pull request URLs', () => {
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/issues/6')).toBe(true);
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/issues/new')).toBe(true);
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/issues')).toBe(true);
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/pull/13')).toBe(true);
      expect(isGitHubIssuePage('/org/repo/issues/100?tab=comments')).toBe(true);
    });

    it('rejects URLs outside of issue and pull request scope', () => {
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/settings')).toBe(false);
      expect(isGitHubIssuePage('/necoz-oss/safe-paste')).toBe(false);
      expect(isGitHubIssuePage('/settings/profile')).toBe(false);
      expect(isGitHubIssuePage('/necoz-oss/safe-paste/issues-archive')).toBe(false);
      expect(isGitHubIssuePage('/issues/123')).toBe(false);
    });

    it('allows blank or unconfigured location for tests by default', () => {
      expect(isGitHubIssuePage('')).toBe(true);
      expect(isGitHubIssuePage('/')).toBe(true);
    });
  });

  describe('isSupportedGitHubEditor', () => {
    it('identifies GitHub issue and comment textareas by selector matching', () => {
      for (const selector of SUPPORTED_GITHUB_EDITOR_SELECTORS) {
        const mockTextarea = {
          tagName: 'TEXTAREA',
          matches: (sel: string) => sel === selector,
        };
        expect(isSupportedGitHubEditor(mockTextarea)).toBe(true);
      }
    });

    it('identifies modern GitHub CommentBox textareas inside verified containers', () => {
      // Modern Primer CommentBox with dynamic ID and Primer class (as reported on /issues/6)
      const modernEditor = {
        tagName: 'TEXTAREA',
        id: '_r_41_',
        className: 'prc-Textarea-TextArea-snlco',
        matches: () => false,
        closest: (selector: string) =>
          selector === '[class*="CommentBox"]' ? { className: 'CommentBox_I-i-2w2x' } : null,
      };
      expect(isSupportedGitHubEditor(modernEditor)).toBe(true);

      for (const containerSelector of MODERN_GITHUB_EDITOR_CONTAINER_SELECTORS) {
        const textareaInContainer = {
          tagName: 'TEXTAREA',
          id: '_r_dynamic_',
          matches: () => false,
          closest: (selector: string) => (selector === containerSelector ? {} : null),
        };
        expect(isSupportedGitHubEditor(textareaInContainer)).toBe(true);
      }
    });

    it('rejects modern CommentBox textareas when located on a non-issue page', () => {
      const modernEditor = {
        tagName: 'TEXTAREA',
        id: '_r_41_',
        className: 'prc-Textarea-TextArea-snlco',
        matches: () => false,
        closest: (selector: string) =>
          selector === '[class*="CommentBox"]' ? { className: 'CommentBox_I-i-2w2x' } : null,
      };

      // Explicit pathname outside issue scope
      expect(isSupportedGitHubEditor(modernEditor, '/settings/profile')).toBe(false);
      expect(isSupportedGitHubEditor(modernEditor, '/necoz-oss/safe-paste/settings')).toBe(false);

      // Environment window.location mock
      const globalScope = globalThis as unknown as {
        window?: { location?: { pathname?: string | undefined } | undefined } | undefined;
      };
      const originalWindow = globalScope.window;
      try {
        globalScope.window = {
          location: { pathname: '/settings/profile' },
        };
        expect(isSupportedGitHubEditor(modernEditor)).toBe(false);
      } finally {
        globalScope.window = originalWindow;
      }
    });

    it('identifies textareas by exact name, id, and class attributes via fallback', () => {
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'issue[body]' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'issue_body' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'comment[body]' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'new_comment_field' })).toBe(true);
      expect(
        isSupportedGitHubEditor({
          tagName: 'TEXTAREA',
          className: 'form-control js-comment-field js-paste-markdown',
        })
      ).toBe(true);
    });

    it('rejects generic or unrelated textareas outside the strict allowlist', () => {
      // Formerly accepted by broad substring matching, now strictly rejected
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'post_body' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'user[bio]' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'repo[description]' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'commit_comment_body' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', className: 'generic-comment-box' })).toBe(false);
    });

    it('rejects input elements, contenteditables, and other tags', () => {
      const titleInput = {
        tagName: 'INPUT',
        name: 'issue[title]',
      };
      expect(isSupportedGitHubEditor(titleInput)).toBe(false);

      const div = {
        tagName: 'DIV',
        className: 'js-comment-field',
      };
      expect(isSupportedGitHubEditor(div)).toBe(false);

      expect(isSupportedGitHubEditor(null)).toBe(false);
      expect(isSupportedGitHubEditor(undefined)).toBe(false);
      expect(isSupportedGitHubEditor({})).toBe(false);
    });
  });

  describe('extractPastedPlaintext', () => {
    it('extracts plaintext from ClipboardEvent clipboardData', () => {
      const mockEvent = {
        clipboardData: {
          getData: (type: string) => (type === 'text/plain' ? 'pasted secret data' : ''),
        },
      } as unknown as ClipboardEvent;

      expect(extractPastedPlaintext(mockEvent)).toBe('pasted secret data');
    });

    it('returns null if clipboardData is missing or empty', () => {
      const emptyEvent = {
        clipboardData: {
          getData: () => '',
        },
      } as unknown as ClipboardEvent;
      expect(extractPastedPlaintext(emptyEvent)).toBe(null);

      const noDataEvent = {} as unknown as ClipboardEvent;
      expect(extractPastedPlaintext(noDataEvent)).toBe(null);
    });
  });

  describe('isTrustedEvent', () => {
    it('returns true only for trusted user events', () => {
      expect(isTrustedEvent({ isTrusted: true } as Event)).toBe(true);
      expect(isTrustedEvent({ isTrusted: false } as Event)).toBe(false);
      expect(isTrustedEvent({} as Event)).toBe(false);
    });
  });
});
