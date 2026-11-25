import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/core/types';
import { getCategoryLabel, getMaskedPreview } from '../../src/ui/preview';

describe('UI Preview: getCategoryLabel', () => {
  it('maps known rule categories to human-friendly labels', () => {
    expect(getCategoryLabel('github_pat_classic')).toBe(
      'GitHub Personal Access Token (Classic)'
    );
    expect(getCategoryLabel('github_pat_fine_grained')).toBe(
      'GitHub Personal Access Token (Fine-grained)'
    );
  });

  it('formats unknown snake_case categories to Title Case', () => {
    expect(getCategoryLabel('slack_webhook_url')).toBe('Slack Webhook Url');
    expect(getCategoryLabel('custom_api_key')).toBe('Custom Api Key');
  });
});

describe('UI Preview: getMaskedPreview', () => {
  it('returns finding mask when present and non-empty', () => {
    const finding: Finding = {
      id: 'f1',
      category: 'github_pat_classic',
      range: { start: 0, end: 40 },
      mask: 'ghp_••••••••',
      replacementText: '[REDACTED]',
    };

    expect(getMaskedPreview(finding)).toBe('ghp_••••••••');
  });

  it('falls back to safe static placeholder when mask is missing or whitespace', () => {
    const finding: Finding = {
      id: 'f2',
      category: 'unknown_token',
      range: { start: 0, end: 20 },
      mask: '   ',
      replacementText: '[REDACTED]',
    };

    expect(getMaskedPreview(finding)).toBe('[SENSITIVE DATA]');
  });
});
