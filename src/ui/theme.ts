/**
 * Native styling for the non-blocking SafePaste warning banner.
 * Uses GitHub Primer CSS variables when available with resilient fallbacks
 * for both light and dark themes.
 */

export const BANNER_STYLES = {
  container: `
    box-sizing: border-box;
    margin: 8px 0;
    padding: 12px 14px;
    border-radius: 6px;
    border: 1px solid var(--borderColor-attention-muted, rgba(212, 167, 44, 0.4));
    background-color: var(--bgColor-attention-muted, #fff8c5);
    color: var(--fgColor-default, #1f2328);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    position: relative;
    z-index: 20;
    transition: opacity 0.15s ease-out;
  `.replace(/\s+/g, ' ').trim(),

  header: `
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 6px;
  `.replace(/\s+/g, ' ').trim(),

  badge: `
    display: inline-block;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    background-color: var(--bgColor-neutral-muted, rgba(175, 184, 193, 0.2));
    color: var(--fgColor-default, #1f2328);
    border: 1px solid var(--borderColor-neutral-muted, rgba(31, 35, 40, 0.15));
  `.replace(/\s+/g, ' ').trim(),

  codePreview: `
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    padding: 2px 5px;
    border-radius: 4px;
    background-color: var(--bgColor-muted, rgba(175, 184, 193, 0.2));
    letter-spacing: 0.5px;
  `.replace(/\s+/g, ' ').trim(),

  findingsList: `
    margin: 6px 0;
    padding-left: 18px;
  `.replace(/\s+/g, ' ').trim(),

  disclaimer: `
    font-size: 11px;
    color: var(--fgColor-muted, #656d76);
    margin-top: 6px;
    margin-bottom: 10px;
  `.replace(/\s+/g, ' ').trim(),

  actions: `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  `.replace(/\s+/g, ' ').trim(),

  buttonRedact: `
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    color: #ffffff;
    background-color: var(--button-primary-bgColor-rest, #1f883d);
    border: 1px solid var(--button-primary-borderColor-rest, rgba(31, 35, 40, 0.15));
    border-radius: 6px;
    box-shadow: var(--shadow-resting-small, 0 1px 0 rgba(31, 35, 40, 0.04));
  `.replace(/\s+/g, ' ').trim(),

  buttonDismiss: `
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    line-height: 20px;
    color: var(--fgColor-default, #1f2328);
    background-color: transparent;
    border: 1px solid var(--button-default-borderColor-rest, rgba(31, 35, 40, 0.15));
    border-radius: 6px;
  `.replace(/\s+/g, ' ').trim(),

  statusError: `
    color: var(--fgColor-danger, #cf222e);
    font-size: 12px;
    margin-top: 6px;
    font-weight: 500;
  `.replace(/\s+/g, ' ').trim(),
};
