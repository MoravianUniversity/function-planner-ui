import { describe, expect, it, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Model } from './model.js';

/**
 * Diagram counterpart: applyingFromYjs in diagram.js prevents GoJS ModelChanged
 * from echoing remote call adds back through addFuncCall. These tests cover the
 * model-layer defenses (idempotent add + undo scoping) that make that safe.
 */

/** @type {Model[]} */
const models = [];

afterEach(() => {
    for (const m of models) {
        m.destroy();
    }
    models.length = 0;
});

function createPeer(label) {
    const ydoc = new Y.Doc();
    const model = new Model(`undo-collab-${label}-${Math.random().toString(36).slice(2)}`, {}, {
        ydoc,
        useIndexedDB: false,
    });
    model.markSynced({ source: 'test' });
    models.push(model);
    return { ydoc, model };
}

/** Sync two docs with a non-null origin so UndoManager (tracks null) ignores remotes. */
function syncPeers(a, b) {
    const updateA = Y.encodeStateAsUpdate(a.ydoc);
    const updateB = Y.encodeStateAsUpdate(b.ydoc);
    Y.applyUpdate(a.ydoc, updateB, 'remote');
    Y.applyUpdate(b.ydoc, updateA, 'remote');
}

describe('collaborative undo of function calls', () => {
    it('does not put remote call adds on the local undo stack', () => {
        const a = createPeer('a');
        const b = createPeer('b');
        syncPeers(a, b);

        expect(a.model.undoManager.canUndo()).toBe(false);

        b.model.addFuncCall('0', '1');
        b.model.addFuncCall('2', '3');
        syncPeers(a, b);

        expect(a.model.calls.has('0-1')).toBe(true);
        expect(a.model.calls.has('2-3')).toBe(true);
        expect(a.model.undoManager.canUndo()).toBe(false);

        // Simulated GoJS echo: addFuncCall for an existing remote key must be a no-op.
        a.model.addFuncCall('0', '1');
        a.model.addFuncCall('2', '3');
        expect(a.model.undoManager.canUndo()).toBe(false);
        expect(a.model.calls.has('0-1')).toBe(true);
        expect(a.model.calls.has('2-3')).toBe(true);
    });

    it('undo removes only the local call, not a peer\'s concurrent calls', () => {
        const a = createPeer('a');
        const b = createPeer('b');
        syncPeers(a, b);

        b.model.addFuncCall('0', '1');
        syncPeers(a, b);
        expect(a.model.calls.has('0-1')).toBe(true);
        expect(a.model.undoManager.canUndo()).toBe(false);

        a.model.addFuncCall('2', '3');
        expect(a.model.calls.has('2-3')).toBe(true);
        expect(a.model.undoManager.canUndo()).toBe(true);

        a.model.undoManager.undo();
        expect(a.model.calls.has('2-3')).toBe(false);
        expect(a.model.calls.has('0-1')).toBe(true);
    });

    it('keeps successive local call adds as separate undo steps', () => {
        const a = createPeer('a');

        a.model.addFuncCall('0', '1');
        a.model.addFuncCall('2', '3');

        expect(a.model.calls.has('0-1')).toBe(true);
        expect(a.model.calls.has('2-3')).toBe(true);

        a.model.undoManager.undo();
        expect(a.model.calls.has('0-1')).toBe(true);
        expect(a.model.calls.has('2-3')).toBe(false);

        a.model.undoManager.undo();
        expect(a.model.calls.has('0-1')).toBe(false);
        expect(a.model.calls.has('2-3')).toBe(false);
    });

    it('clears undo stack after markSynced so seed is not undoable', () => {
        const ydoc = new Y.Doc();
        const model = new Model(`undo-seed-${Math.random().toString(36).slice(2)}`, {
            functions: [{ key: '1', name: 'main' }],
            calls: [{ from: '1', to: '1' }],
        }, { ydoc, useIndexedDB: false });
        models.push(model);

        model.markSynced({ source: 'test' });
        expect(model.calls.has('1-1')).toBe(true);
        expect(model.undoManager.canUndo()).toBe(false);
    });
});
