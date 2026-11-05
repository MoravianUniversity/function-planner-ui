import { describe, expect, it } from 'vitest';
import { toEnglishType, isOptionalType, stripOptional, withOptional } from './type-utils.js';

describe('type-utils unions and optional', () => {
  it('renders container|None unions in English', () => {
    expect(toEnglishType('list[int]|None')).toBe('(list of int) or None');
    expect(toEnglishType('int|str|None')).toBe('int, str, or None');
  });

  it('re-exports optional helpers', () => {
    expect(isOptionalType('int|None')).toBe(true);
    expect(stripOptional('int|None')).toBe('int');
    expect(withOptional('int')).toBe('int|None');
  });
});
