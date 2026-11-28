/** Scoped banner styles. The 3px stepped frame follows the portfolio's .frame. */
export const BANNER_CSS = `
[data-safepaste-banner] {
  --sp-pixel: 3px;
  --sp-frame: #7caa4a;
  --sp-fill: #171917;
  box-sizing: border-box;
  width: 100%; min-width: 0; margin: 0; padding: 14px 16px;
  color: #7caa4a;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background-image:
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-frame) 0 0), linear-gradient(var(--sp-frame) 0 0),
    linear-gradient(var(--sp-fill) 0 0), linear-gradient(var(--sp-fill) 0 0),
    linear-gradient(var(--sp-fill) 0 0), linear-gradient(var(--sp-fill) 0 0),
    linear-gradient(var(--sp-fill) 0 0);
  background-repeat: no-repeat;
  background-size:
    calc(100% - 18px) 3px, calc(100% - 18px) 3px,
    3px calc(100% - 18px), 3px calc(100% - 18px),
    3px 3px, 3px 3px, 3px 3px, 3px 3px,
    3px 3px, 3px 3px, 3px 3px, 3px 3px,
    calc(100% - 18px) 3px, calc(100% - 12px) 3px,
    calc(100% - 6px) calc(100% - 18px),
    calc(100% - 12px) 3px, calc(100% - 18px) 3px;
  background-position:
    9px 0, 9px 100%, 0 9px, 100% 9px,
    left 6px top 3px, left 3px top 6px, right 6px top 3px, right 3px top 6px,
    left 3px bottom 6px, left 6px bottom 3px, right 6px bottom 3px, right 3px bottom 6px,
    9px 3px, 6px 6px, 3px 9px, 6px calc(100% - 6px), 9px calc(100% - 3px);
  animation: safepaste-pop 160ms steps(3, end) both;
}
[data-safepaste-banner] .sp-brand { color: #a9c68b; font: 700 11px/1.4 ui-monospace, monospace; letter-spacing: .04em; }
[data-safepaste-banner] .sp-brand-mark { color: #7caa4a; }
[data-safepaste-banner] .sp-title { display: inline-block; max-width: 100%; font-weight: 700; animation: safepaste-type 450ms steps(25, end) both; }
[data-safepaste-banner] .sp-findings { margin: 6px 0; padding: 0; list-style: none; }
[data-safepaste-banner] .sp-findings li { margin: 2px 0; overflow-wrap: anywhere; }
[data-safepaste-banner] .sp-category { color: #a9c68b; font-size: 12px; }
[data-safepaste-banner] code { font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
[data-safepaste-banner] .sp-disclaimer { color: #a9c68b; font-size: 11px; }
[data-safepaste-banner] .sp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
[data-safepaste-banner] button {
  --sp-button-edge: #a9c68b;
  --sp-button-fill: var(--sp-fill);
  --sp-button-shell-shape: polygon(
      9px 0,
      calc(100% - 9px) 0,
      calc(100% - 9px) 3px,
      calc(100% - 6px) 3px,
      calc(100% - 6px) 6px,
      calc(100% - 3px) 6px,
      calc(100% - 3px) 9px,
      100% 9px,
      100% calc(100% - 9px),
      calc(100% - 3px) calc(100% - 9px),
      calc(100% - 3px) calc(100% - 6px),
      calc(100% - 6px) calc(100% - 6px),
      calc(100% - 6px) calc(100% - 3px),
      calc(100% - 9px) calc(100% - 3px),
      calc(100% - 9px) 100%,
      9px 100%,
      9px calc(100% - 3px),
      6px calc(100% - 3px),
      6px calc(100% - 6px),
      3px calc(100% - 6px),
      3px calc(100% - 9px),
      0 calc(100% - 9px),
      0 9px,
      3px 9px,
      3px 6px,
      6px 6px,
      6px 3px,
      9px 3px
    );
  --sp-button-fill-shape: polygon(
      6px 0,
      calc(100% - 6px) 0,
      calc(100% - 6px) 3px,
      calc(100% - 3px) 3px,
      calc(100% - 3px) 6px,
      100% 6px,
      100% calc(100% - 6px),
      calc(100% - 3px) calc(100% - 6px),
      calc(100% - 3px) calc(100% - 3px),
      calc(100% - 6px) calc(100% - 3px),
      calc(100% - 6px) 100%,
      6px 100%,
      6px calc(100% - 3px),
      3px calc(100% - 3px),
      3px calc(100% - 6px),
      0 calc(100% - 6px),
      0 6px,
      3px 6px,
      3px 3px,
      6px 3px
    );
  position: relative; isolation: isolate; cursor: pointer; min-height: 36px;
  padding: 6px 14px; border: 0; border-radius: 0; background: transparent;
  font: 600 12px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
[data-safepaste-banner] button::before, [data-safepaste-banner] button::after { content: ''; position: absolute; pointer-events: none; }
[data-safepaste-banner] button::before { inset: 0; z-index: -2; background: var(--sp-button-edge); clip-path: var(--sp-button-shell-shape); }
[data-safepaste-banner] button::after { inset: 3px; z-index: -1; background: var(--sp-button-fill); clip-path: var(--sp-button-fill-shape); }
[data-safepaste-banner] button:focus-visible { outline: 2px solid var(--focus-outlineColor, #0969da); outline-offset: 2px; }
[data-safepaste-banner] .sp-redact { --sp-button-edge: var(--sp-frame); --sp-button-fill: #171917; color: #7caa4a; }
[data-safepaste-banner] .sp-redact:hover:not(:disabled) { --sp-button-fill: var(--sp-frame); color: #171917; }
[data-safepaste-banner] .sp-redact:active:not(:disabled) { --sp-button-fill: #4f5b39; color: #fff; }
[data-safepaste-banner] .sp-redact:disabled { opacity: .6; cursor: default; }
[data-safepaste-banner] .sp-dismiss { color: inherit; }
[data-safepaste-banner] .sp-dismiss:hover { --sp-button-fill: #303a28; }
[data-safepaste-banner] .sp-dismiss:active { --sp-button-edge: #a9c68b; }
[data-safepaste-banner] .sp-error { color: #ff9b92; font-size: 12px; margin-top: 6px; font-weight: 500; }
@keyframes safepaste-pop { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
@keyframes safepaste-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
@media (prefers-reduced-motion: reduce) {
  [data-safepaste-banner], [data-safepaste-banner] .sp-title { animation: none; }
}
`;
