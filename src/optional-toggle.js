/**
 * Shared optional-type toggle (T vs T|None).
 *
 * Off = required (solid chip). On = optional / allows None (dashed chip + ?).
 */

const OPTIONAL_ICON_SVG = `
<svg class="fp-optional-icon" viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true" focusable="false">
  <g class="fp-optional-glyph-off">
    <rect x="3" y="4" width="14" height="12" rx="2.5" fill="currentColor"/>
  </g>
  <g class="fp-optional-glyph-on">
    <rect x="1" y="1.5" width="18" height="17" rx="3" fill="none"
          stroke="currentColor" stroke-width="1.85" stroke-dasharray="3 1.9"/>
    <text x="10" y="14.2" text-anchor="middle"
          font-size="12" font-weight="700" font-family="system-ui, sans-serif"
          fill="currentColor">?</text>
  </g>
</svg>`.trim();

/**
 * @param {object} [opts]
 * @param {boolean} [opts.checked]
 * @param {(checked: boolean, btn: HTMLButtonElement) => void} [opts.onChange]
 * @returns {HTMLButtonElement}
 */
export function createOptionalToggle({ checked = false, onChange = null } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fp-optional-toggle';
    btn.innerHTML = OPTIONAL_ICON_SVG;
    setOptionalToggle(btn, checked);
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) { return; }
        const next = !isOptionalToggleOn(btn);
        setOptionalToggle(btn, next);
        if (typeof onChange === 'function') { onChange(next, btn); }
    });
    return btn;
}

/** @param {HTMLButtonElement|null|undefined} btn @param {boolean} checked */
export function setOptionalToggle(btn, checked) {
    if (!btn) { return; }
    const on = Boolean(checked);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('fp-optional-on', on);
    btn.title = on
        ? 'Optional — allows None. Click to require a value.'
        : 'Required. Click to allow None (optional).';
    btn.setAttribute('aria-label', on ? 'Optional (allows None)' : 'Required');
}

/** @param {HTMLButtonElement|null|undefined} btn */
export function isOptionalToggleOn(btn) {
    return btn?.getAttribute('aria-pressed') === 'true';
}
