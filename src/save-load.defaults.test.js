import { describe, expect, it } from 'vitest';
import { pythonDefLine } from './save-load.js';

describe('pythonDefLine defaults and optional types', () => {
  it('emits parameter defaults', () => {
    expect(pythonDefLine('greet', [
      { name: 'name', type: 'str', default: '"world"' },
      { name: 'n', type: 'int', default: '1' }
    ], [{ type: 'str' }])).toBe('def greet(name: str = "world", n: int = 1) -> str:');
  });

  it('emits optional union types as stored', () => {
    expect(pythonDefLine('f', [
      { name: 'x', type: 'int|None' }
    ], [{ type: 'str|None' }])).toBe('def f(x: int|None) -> str|None:');
  });
});
