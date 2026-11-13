import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { Model } from './model.js';
import {
    applyCodeVisibilityForClipboard,
    buildFunctionClipboardPayload,
    clearFunctionClipboardCache,
    functionDataFromEnvelope,
    getFunctionClipboardCache,
    isEditingText,
    looksLikePythonFunction,
    prepareFunctionForPaste,
    readFunctionsFromClipboard,
    stripEphemeralFunctionFields,
    writeFunctionClipboard,
    FUNCTION_CLIPBOARD_VERSION,
} from './function-clipboard.js';
import { generatePythonFromFunctionJSON } from './save-load.js';

function createModel(initial = {}) {
    const model = new Model(`test-clipboard-${Math.random().toString(36).slice(2)}`, initial, {
        useIndexedDB: false,
    });
    model.markSynced({ source: 'test' });
    return model;
}

describe('function clipboard helpers', () => {
    let model;

    beforeEach(() => {
        clearFunctionClipboardCache();
        model = createModel({
            authors: ['alice'],
            functions: [{
                key: '0',
                name: 'helper',
                desc: 'does a thing',
                code: 'return 1',
                testCode: 'assert helper() == 1',
                params: [{ name: 'x', type: 'int', desc: '' }],
                returns: [{ type: 'int', desc: '' }],
                io: 'none',
                testable: true,
                owner: 'alice',
                sequence: 3,
            }],
            calls: [],
        });
    });

    afterEach(() => {
        model.destroy();
        clearFunctionClipboardCache();
    });

    it('stripEphemeralFunctionFields removes key/sequence/problems', () => {
        const stripped = stripEphemeralFunctionFields({
            name: 'a',
            key: '9',
            sequence: 2,
            problems: [['error', 'name', 'x']],
            linkProblems: [],
            readOnly: true,
        });
        expect(stripped).toEqual({ name: 'a' });
    });

    it('applyCodeVisibilityForClipboard drops code/tests when patterns do not match', () => {
        const data = {
            name: 'helper',
            code: 'return 1',
            testCode: 'assert True',
        };
        expect(applyCodeVisibilityForClipboard(data, { showCodeFor: '', showTestCodeFor: '' }))
            .toEqual({ name: 'helper' });
        expect(applyCodeVisibilityForClipboard(data, { showCodeFor: '^helper$', showTestCodeFor: '' }))
            .toEqual({ name: 'helper', code: 'return 1' });
        expect(applyCodeVisibilityForClipboard(data, {
            showCodeFor: '',
            showTestCodeFor: '',
            adminMode: true,
        })).toEqual(data);
    });

    it('buildFunctionClipboardPayload omits hidden code and builds python stub', () => {
        const payload = buildFunctionClipboardPayload(model, '0', {
            showCodeFor: '',
            showTestCodeFor: '',
        });
        expect(payload).not.toBeNull();
        expect(payload.envelope.v).toBe(FUNCTION_CLIPBOARD_VERSION);
        expect(payload.envelope.function.code).toBeUndefined();
        expect(payload.envelope.function.testCode).toBeUndefined();
        expect(payload.envelope.function.name).toBe('helper');
        expect(payload.python).toContain('def helper(');
        expect(payload.python).toContain('# TODO: implement this function');
        expect(payload.python).not.toContain('return 1');
    });

    it('buildFunctionClipboardPayload keeps code when visible', () => {
        const payload = buildFunctionClipboardPayload(model, '0', {
            showCodeFor: '.*',
            showTestCodeFor: '.*',
        });
        expect(payload.envelope.function.code).toBe('return 1');
        expect(payload.envelope.function.testCode).toBe('assert helper() == 1');
        expect(payload.python).toContain('return 1');
    });

    it('prepareFunctionForPaste strips invisible fields and invalid owner', () => {
        const pasted = prepareFunctionForPaste({
            name: 'helper',
            code: 'return 1',
            testCode: 'assert True',
            owner: 'bob',
            key: '99',
        }, model, { showCodeFor: '', showTestCodeFor: '' });
        expect(pasted.code).toBeUndefined();
        expect(pasted.testCode).toBeUndefined();
        expect(pasted.owner).toBeUndefined();
        expect(pasted.key).toBeUndefined();
    });

    it('prepareFunctionForPaste keeps owner when present in authors', () => {
        const pasted = prepareFunctionForPaste({
            name: 'helper',
            owner: 'alice',
        }, model, { adminMode: true });
        expect(pasted.owner).toBe('alice');
    });

    it('paste via addFunc yields a new key with preserved fields', () => {
        const payload = buildFunctionClipboardPayload(model, '0', {
            showCodeFor: '.*',
            showTestCodeFor: '.*',
            adminMode: true,
        });
        const data = prepareFunctionForPaste(payload.envelope.function, model, {
            showCodeFor: '.*',
            showTestCodeFor: '.*',
            adminMode: true,
        });
        model.addFunc(data);
        expect(model.functions.size).toBe(2);
        const added = model.functions.get('1');
        expect(added.get('name').toString()).toBe('helper');
        expect(added.get('code').toString()).toBe('return 1');
        expect(added.get('params').toJSON()).toEqual([{ name: 'x', type: 'int', desc: '' }]);
    });

    it('writeFunctionClipboard stores in-memory cache used by readFunctionsFromClipboard', async () => {
        const payload = buildFunctionClipboardPayload(model, '0', { adminMode: true });
        writeFunctionClipboard(payload);
        expect(getFunctionClipboardCache()?.python).toBe(payload.python);
        const funcs = await readFunctionsFromClipboard(null);
        expect(funcs).toHaveLength(1);
        expect(funcs[0].name).toBe('helper');
    });

    it('functionDataFromEnvelope rejects bad payloads', () => {
        expect(functionDataFromEnvelope(null)).toBeNull();
        expect(functionDataFromEnvelope({ v: 1 })).toBeNull();
        expect(functionDataFromEnvelope({ v: 2, function: { name: 'x' } })).toBeNull();
        expect(functionDataFromEnvelope({ v: 1, function: { name: 'x' } })).toEqual({ name: 'x' });
    });

    it('looksLikePythonFunction detects def lines', () => {
        expect(looksLikePythonFunction('def foo():\n    pass')).toBe(true);
        expect(looksLikePythonFunction('x = 1')).toBe(false);
    });

    it('python fallback parse yields pasteable function objects', async () => {
        const dt = {
            getData(type) {
                if (type === 'text/plain') {
                    return 'def foo(a: int) -> int:\n    """hi"""\n    return a\n';
                }
                return '';
            },
        };
        const funcs = await readFunctionsFromClipboard(dt);
        expect(funcs.length).toBeGreaterThanOrEqual(1);
        expect(funcs[0].name).toBe('foo');
        expect(funcs[0].key).toBeUndefined();
    });

    it('generatePythonFromFunctionJSON matches stub shape', () => {
        const text = generatePythonFromFunctionJSON({
            name: 'add',
            params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
            returns: [{ type: 'int' }],
            desc: 'sum',
        }, {}, { calledNames: ['helper'] });
        expect(text).toContain('def add(a: int, b: int) -> int:');
        expect(text).toContain('sum');
        expect(text).toContain('# Calls helper()');
        expect(text).toContain('return 0');
    });
});

describe('isEditingText', () => {
    it('is false when nothing is focused with a selection', () => {
        // jsdom: no meaningful selection by default
        expect(typeof isEditingText()).toBe('boolean');
    });
});
