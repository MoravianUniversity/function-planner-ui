import { describe, expect, it } from 'vitest';
import { createOptionalToggle, setOptionalToggle, isOptionalToggleOn } from './optional-toggle.js';

describe('optional toggle', () => {
    it('starts required and toggles to optional with distinct pressed state', () => {
        const changes = [];
        const btn = createOptionalToggle({
            checked: false,
            onChange: (checked) => { changes.push(checked); }
        });
        expect(isOptionalToggleOn(btn)).toBe(false);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.classList.contains('fp-optional-on')).toBe(false);

        btn.click();
        expect(isOptionalToggleOn(btn)).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.classList.contains('fp-optional-on')).toBe(true);
        expect(changes).toEqual([true]);

        btn.click();
        expect(isOptionalToggleOn(btn)).toBe(false);
        expect(changes).toEqual([true, false]);
    });

    it('setOptionalToggle updates without firing click handlers', () => {
        const changes = [];
        const btn = createOptionalToggle({
            checked: false,
            onChange: (checked) => { changes.push(checked); }
        });
        setOptionalToggle(btn, true);
        expect(isOptionalToggleOn(btn)).toBe(true);
        expect(changes).toEqual([]);
    });
});
