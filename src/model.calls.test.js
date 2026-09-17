import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Model } from './model.js';

function createModel() {
    const model = new Model(`test-calls-${Math.random().toString(36).slice(2)}`, {}, {
        useIndexedDB: false,
    });
    model.markSynced({ source: 'test' });
    return model;
}

function callEvents(model) {
    const events = [];
    model.addFuncCallListener((action, oldFrom, oldTo, newFrom, newTo) => {
        if (action === 'problems') { return; }
        events.push({ action, oldFrom, oldTo, newFrom, newTo });
    });
    return events;
}

describe('Model #callObserver', () => {
    let model;

    beforeEach(() => {
        model = createModel();
    });

    afterEach(() => {
        model.destroy();
    });

    it('fires add for a single call', () => {
        const events = callEvents(model);
        model.addFuncCall('0', '1');
        expect(events).toEqual([
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '0', newTo: '1' },
        ]);
        expect(model.calledFunctions['0']).toEqual(['1']);
        expect(model.callingFunctions['1']).toEqual(['0']);
    });

    it('fires delete for a single call removal', () => {
        model.addFuncCall('0', '1');
        const events = callEvents(model);
        model.removeFuncCall('0', '1');
        expect(events).toEqual([
            { action: 'delete', oldFrom: '0', oldTo: '1', newFrom: null, newTo: null },
        ]);
        expect(model.calledFunctions['0'] || []).toEqual([]);
        expect(model.callingFunctions['1'] || []).toEqual([]);
    });

    it('applies unrelated delete+add in one transaction independently', () => {
        model.addFuncCall('0', '1');
        model.addFuncCall('2', '3');
        const events = callEvents(model);

        // Simulates concurrent collab: delete one edge and add another in one Yjs event.
        // The old heuristic would mis-pair these as update 0-1 → 4-5.
        model.model.transact(() => {
            model.calls.delete('0-1');
            model.calls.set('4-5', true);
        });

        expect(events).toEqual([
            { action: 'delete', oldFrom: '0', oldTo: '1', newFrom: null, newTo: null },
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '4', newTo: '5' },
        ]);
        expect(model.calls.has('0-1')).toBe(false);
        expect(model.calls.has('2-3')).toBe(true);
        expect(model.calls.has('4-5')).toBe(true);
        expect(model.calledFunctions['0'] || []).toEqual([]);
        expect(model.calledFunctions['2']).toEqual(['3']);
        expect(model.calledFunctions['4']).toEqual(['5']);
        expect(model.callingFunctions['1'] || []).toEqual([]);
        expect(model.callingFunctions['3']).toEqual(['2']);
        expect(model.callingFunctions['5']).toEqual(['4']);
    });

    it('applies updateFuncCall as delete then add', () => {
        model.addFuncCall('0', '1');
        const events = callEvents(model);
        model.updateFuncCall('0', '1', '1', '0');

        expect(events).toEqual([
            { action: 'delete', oldFrom: '0', oldTo: '1', newFrom: null, newTo: null },
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '1', newTo: '0' },
        ]);
        expect(model.calls.has('0-1')).toBe(false);
        expect(model.calls.has('1-0')).toBe(true);
        expect(model.calledFunctions['0'] || []).toEqual([]);
        expect(model.calledFunctions['1']).toEqual(['0']);
        expect(model.callingFunctions['0']).toEqual(['1']);
        expect(model.callingFunctions['1'] || []).toEqual([]);
    });

    it('applies multiple deletes then multiple adds in one transaction', () => {
        model.addFuncCall('0', '1');
        model.addFuncCall('2', '3');
        model.addFuncCall('4', '5');
        const events = callEvents(model);

        model.model.transact(() => {
            model.calls.delete('0-1');
            model.calls.delete('2-3');
            model.calls.set('6-7', true);
            model.calls.set('8-9', true);
        });

        const deletes = events.filter((e) => e.action === 'delete');
        const adds = events.filter((e) => e.action === 'add');
        // All deletes must be applied before any add (order-safe observer).
        expect(events.map((e) => e.action)).toEqual([
            'delete', 'delete', 'add', 'add',
        ]);
        expect(deletes).toEqual(expect.arrayContaining([
            { action: 'delete', oldFrom: '0', oldTo: '1', newFrom: null, newTo: null },
            { action: 'delete', oldFrom: '2', oldTo: '3', newFrom: null, newTo: null },
        ]));
        expect(adds).toEqual(expect.arrayContaining([
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '6', newTo: '7' },
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '8', newTo: '9' },
        ]));
        expect([...model.calls.keys()].sort()).toEqual(['4-5', '6-7', '8-9']);
        expect(model.calledFunctions['4']).toEqual(['5']);
        expect(model.calledFunctions['6']).toEqual(['7']);
        expect(model.calledFunctions['8']).toEqual(['9']);
        expect(model.calledFunctions['0'] || []).toEqual([]);
        expect(model.calledFunctions['2'] || []).toEqual([]);
    });

    it('does not mis-pair delete A-B with add of reversed B-A when a third edge also changes', () => {
        model.addFuncCall('0', '1');
        model.addFuncCall('2', '3');
        const events = callEvents(model);

        model.model.transact(() => {
            model.calls.delete('0-1');
            model.calls.set('1-0', true);
            model.calls.delete('2-3');
            model.calls.set('4-5', true);
        });

        expect(events.map((e) => e.action)).toEqual([
            'delete', 'delete', 'add', 'add',
        ]);
        expect(events.filter((e) => e.action === 'delete')).toEqual(expect.arrayContaining([
            { action: 'delete', oldFrom: '0', oldTo: '1', newFrom: null, newTo: null },
            { action: 'delete', oldFrom: '2', oldTo: '3', newFrom: null, newTo: null },
        ]));
        expect(events.filter((e) => e.action === 'add')).toEqual(expect.arrayContaining([
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '1', newTo: '0' },
            { action: 'add', oldFrom: null, oldTo: null, newFrom: '4', newTo: '5' },
        ]));
        expect(model.calls.has('0-1')).toBe(false);
        expect(model.calls.has('1-0')).toBe(true);
        expect(model.calls.has('2-3')).toBe(false);
        expect(model.calls.has('4-5')).toBe(true);
    });
});
