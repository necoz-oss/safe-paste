import type { Finding } from '../core/types';

/**
 * Friendly display labels for known detection rule categories.
 */
const CATEGORY_LABELS: Record<string, string> = {
  github_pat_classic: 'GitHub Personal Access Token (Classic)',
  github_pat_fine_grained: 'GitHub Personal Access Token (Fine-grained)',
};

/**
 * Returns a human-readable category name for UI display.
 */
export function getCategoryLabel(category: string): string {
  const label = CATEGORY_LABELS[category];
  if (label) {
    return label;
  }
  // Fallback for custom or future categories: format snake_case to Title Case
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Returns a safe masked representation of the finding without ever disclosing
 * the raw secret characters.
 *
 * Adheres strictly to Zero Secret Retention: downstream UI only displays
 * static masks or category badges.
 */
export function getMaskedPreview(finding: Finding): string {
  if (finding.mask && finding.mask.trim().length > 0) {
    return finding.mask;
  }
  return '[SENSITIVE DATA]';
}
