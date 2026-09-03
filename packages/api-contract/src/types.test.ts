import { describe, expect, it } from 'vitest';
import { isGameId } from './types';

describe('isGameId', () => {
  it('accepts the slugs the ingestion pipeline mints', () => {
    expect(isGameId('azul')).toBe(true);
    expect(isGameId('brass-birmingham')).toBe(true);
    expect(isGameId('7-wonders')).toBe(true);
  });

  it('rejects anything that could escape a directory or a filter', () => {
    expect(isGameId('..')).toBe(false);
    expect(isGameId('../../etc/passwd')).toBe(false);
    expect(isGameId('azul/rulebook')).toBe(false);
    expect(isGameId('')).toBe(false);
  });

  it('rejects shapes that would make two ids mean one game', () => {
    expect(isGameId('Azul')).toBe(false);
    expect(isGameId('-azul')).toBe(false);
    expect(isGameId('azul ')).toBe(false);
  });
});
