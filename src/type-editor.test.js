import { describe, expect, it } from 'vitest';
import TypeEditor from './type-editor.js';

function roundTrip(typeStr, options = {}) {
    const el = document.createElement('div');
    const editor = new TypeEditor(el, {
        allowedTypes: ['int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'set', 'custom'],
        allowUnionTypes: true,
        allowOptionalTypes: true,
        initialType: typeStr,
        ...options
    });
    return editor.getTypeString();
}

describe('TypeEditor unions and optional', () => {
    it('round-trips optional base types', () => {
        expect(roundTrip('int|None')).toBe('int|None');
        expect(roundTrip('str|None')).toBe('str|None');
    });

    it('round-trips unions via the union dropdown type', () => {
        expect(roundTrip('int|str')).toBe('int|str');
        expect(roundTrip('int|str|float')).toBe('int|str|float');
    });

    it('round-trips optional unions', () => {
        expect(roundTrip('int|str|None')).toBe('int|str|None');
    });

    it('round-trips nested optional and nested unions', () => {
        expect(roundTrip('list[int|None]')).toBe('list[int|None]');
        expect(roundTrip('list[int|str]')).toBe('list[int|str]');
        expect(roundTrip('list[int]|None')).toBe('list[int]|None');
        expect(roundTrip('dict[str, int|None]')).toBe('dict[str, int|None]');
    });

    it('dedupes union members (and collapses to a single type when needed)', () => {
        const el = document.createElement('div');
        const editor = new TypeEditor(el, {
            allowedTypes: ['int', 'str', 'list', 'custom'],
            allowUnionTypes: true,
            allowOptionalTypes: true,
            initialType: 'int|str'
        });
        // Force a duplicate arm in the UI, then read the generated string
        const unionContainer = el.querySelector(':scope > .type-container');
        const memberSelects = [...unionContainer.querySelectorAll(
            ':scope > .indented-nested > .type-container > .type-body > select:not(.mode-select)'
        )];
        expect(memberSelects.length).toBeGreaterThanOrEqual(2);
        memberSelects[0].value = 'int';
        memberSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
        memberSelects[1].value = 'int';
        memberSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
        expect(editor.getTypeString()).toBe('int');

        expect(roundTrip('int|int|str')).toBe('int|str');
        expect(roundTrip('list[int]|list[int]')).toBe('list[int]');
        expect(roundTrip('int|int|None')).toBe('int|None');
    });

    it('places optional toggle inline after of/with (or the type select)', () => {
        const el = document.createElement('div');
        new TypeEditor(el, {
            allowedTypes: ['int', 'str', 'list', 'set', 'custom'],
            allowUnionTypes: true,
            allowOptionalTypes: true,
            initialType: 'list[int|None]|None'
        });
        const root = el.querySelector(':scope > .type-container');
        const rootBody = root.querySelector(':scope > .type-body');
        const rootOptional = rootBody.querySelector(':scope > .fp-optional-toggle');
        expect(rootOptional.getAttribute('aria-pressed')).toBe('true');
        expect(rootBody.querySelector(':scope > .mode-select').nextElementSibling).toBe(rootOptional);

        const nested = root.querySelector(':scope > .indented-nested > .type-container');
        const nestedBody = nested.querySelector(':scope > .type-body');
        const nestedOptional = nestedBody.querySelector(':scope > .fp-optional-toggle');
        expect(nestedOptional.getAttribute('aria-pressed')).toBe('true');
        expect(nestedBody.querySelector(':scope > select:not(.mode-select)').nextElementSibling).toBe(nestedOptional);
    });

    it('does not offer optional or union on direct union members', () => {
        const el = document.createElement('div');
        const editor = new TypeEditor(el, {
            allowedTypes: ['int', 'str', 'list', 'custom'],
            allowUnionTypes: true,
            allowOptionalTypes: true,
            initialType: 'int|str'
        });
        const unionContainer = el.querySelector(':scope > .type-container');
        expect(unionContainer.querySelector(':scope > .type-body > select').value).toBe('union');
        expect(unionContainer.querySelector(':scope > .type-body > .fp-optional-toggle')).toBeTruthy();

        const memberContainers = [...unionContainer.querySelectorAll(':scope > .indented-nested > .type-container')];
        expect(memberContainers.length).toBe(2);
        for (const member of memberContainers) {
            expect(member.querySelector('.fp-optional-toggle')).toBeNull();
            const values = [...member.querySelectorAll(':scope > .type-body > select:not(.mode-select) option')].map((o) => o.value);
            expect(values).not.toContain('union');
        }
        expect(editor.getTypeString()).toBe('int|str');
    });
});
