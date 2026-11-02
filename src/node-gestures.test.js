import { describe, expect, it } from 'vitest';

import {
    shouldStartDragging,
    shouldStartLinking,
} from './node-gestures.js';

describe('shouldStartLinking / shouldStartDragging', () => {
    it('always links from border, halo, and parens', () => {
        for (const zone of ['border', 'halo', 'parens']) {
            expect(shouldStartLinking(zone, true, 10, 0)).toBe(true);
            expect(shouldStartDragging(zone, true, 10, 0)).toBe(false);
            expect(shouldStartLinking(zone, false, 0, 10)).toBe(true);
            expect(shouldStartDragging(zone, false, 0, 10)).toBe(false);
        }
    });

    it('horizontal interior drag reorders when allowed', () => {
        expect(shouldStartLinking('name', true, 12, 3)).toBe(false);
        expect(shouldStartDragging('name', true, 12, 3)).toBe(true);
        expect(shouldStartLinking('interior', true, 12, 3)).toBe(false);
        expect(shouldStartDragging('interior', true, 12, 3)).toBe(true);
    });

    it('vertical or diagonal interior drag links when reorder is allowed', () => {
        expect(shouldStartLinking('name', true, 3, 12)).toBe(true);
        expect(shouldStartDragging('name', true, 3, 12)).toBe(false);
        // Tie goes to linking
        expect(shouldStartLinking('name', true, 10, 10)).toBe(true);
        expect(shouldStartDragging('name', true, 10, 10)).toBe(false);
    });

    it('interior drag links when reorder is not possible', () => {
        expect(shouldStartLinking('name', false, 12, 0)).toBe(true);
        expect(shouldStartDragging('name', false, 12, 0)).toBe(false);
    });
});
