import { describe, expect, it, afterEach } from 'vitest';
import { Model } from './model.js';

const BASE = {
  functions: [
    { key: '1', name: 'get_new_grade', desc: 'template' },
    { key: '2', name: 'main', desc: 'entry' }
  ],
  calls: []
};

describe('templateFunctionKeys provenance', () => {
  /** @type {Model[]} */
  const models = [];

  afterEach(() => {
    for (const m of models) {
      m.destroy();
    }
    models.length = 0;
  });

  function makeModel(initialData, opts = {}) {
    const model = new Model(`test-${models.length}-${Date.now()}`, initialData, {
      useIndexedDB: false,
      freezeTemplateFunctionKeys: true,
      ...opts
    });
    models.push(model);
    return model;
  }

  it('freezes seeded keys on markSynced and exempts addFunc keys', () => {
    const model = makeModel(BASE);
    model.markSynced({ source: 'test' });
    expect(model.getTemplateFunctionKeys()).toEqual(['1', '2']);
    expect(model.isTemplateFunctionKey('1')).toBe(true);
    expect(model.isTemplateFunctionKey('2')).toBe(true);

    model.addFunc({ name: 'get_new_grades' });
    expect(model.isTemplateFunctionKey('3')).toBe(false);
    expect(model.getTemplateFunctionKeys()).toEqual(['1', '2']);
  });

  it('migrates missing keys as intersection with initialData', () => {
    const model = makeModel(BASE);
    // Simulate a pre-existing doc without templateFunctionKeys.
    model.importModel({
      functions: [
        { key: '1', name: 'get_new_grade' },
        { key: '3', name: 'student_only' }
      ],
      calls: [],
      // Explicitly omit templateFunctionKeys; import migrates immediately.
    });
    // importModel migrates when missing — key 3 is not in initialData
    expect(model.getTemplateFunctionKeys()).toEqual(['1']);
    expect(model.isTemplateFunctionKey('1')).toBe(true);
    expect(model.isTemplateFunctionKey('3')).toBe(false);
  });

  it('does not persist template keys when freeze is disabled', () => {
    const model = makeModel(BASE, { freezeTemplateFunctionKeys: false });
    model.markSynced({ source: 'test' });
    expect(model.getTemplateFunctionKeys()).toBe(null);
    expect(model.isTemplateFunctionKey('99')).toBe(true);
  });

  it('blocks student updateModelData of templateFunctionKeys', () => {
    const model = makeModel(BASE);
    model.markSynced({ source: 'test' });
    model.updateModelData('templateFunctionKeys', ['1', '2', '3']);
    expect(model.getTemplateFunctionKeys()).toEqual(['1', '2']);
  });
});
