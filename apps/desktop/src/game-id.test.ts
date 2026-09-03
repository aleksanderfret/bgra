import { describe, expect, it } from 'vitest';
import { isGameId } from './game-id';

describe('isGameId', () => {
  it('accepts slugs', () => {
    expect(isGameId('azul')).toBe(true);
    expect(isGameId('brass-birmingham')).toBe(true);
  });

  it('rejects path traversal and uppercase', () => {
    expect(isGameId('../x')).toBe(false);
    expect(isGameId('Azul')).toBe(false);
  });
});
