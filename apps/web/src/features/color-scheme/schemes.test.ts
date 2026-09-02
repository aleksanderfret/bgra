import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, isColorScheme } from './schemes';

describe('isColorScheme', () => {
  it.each(COLOR_SCHEMES)('accepts %s', (value) => {
    expect(isColorScheme(value)).toBe(true);
  });

  it('rejects anything Mantine would not persist', () => {
    expect(isColorScheme('system')).toBe(false);
    expect(isColorScheme('')).toBe(false);
  });
});
