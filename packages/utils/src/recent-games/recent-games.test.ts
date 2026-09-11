import { describe, expect, it } from 'vitest';
import {
  loadRecentGameIds,
  MAX_RECENT_GAMES,
  RECENT_GAMES_STORAGE_KEY,
  recordRecentGame,
} from './recent-games';

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

describe('recent games', () => {
  it('records MRU order and caps at MAX_RECENT_GAMES', () => {
    const storage = memoryStorage();
    for (let index = 0; index < MAX_RECENT_GAMES + 3; index += 1) {
      recordRecentGame(`game-${index}`, storage);
    }
    const ids = loadRecentGameIds(storage);
    expect(ids).toHaveLength(MAX_RECENT_GAMES);
    expect(ids[0]).toBe(`game-${MAX_RECENT_GAMES + 2}`);
    expect(storage.getItem(RECENT_GAMES_STORAGE_KEY)).toContain('game-');
  });

  it('rejects invalid game ids and corrupt storage', () => {
    const storage = memoryStorage();
    recordRecentGame('../x', storage);
    expect(loadRecentGameIds(storage)).toEqual([]);
    storage.setItem(RECENT_GAMES_STORAGE_KEY, '{');
    expect(loadRecentGameIds(storage)).toEqual([]);
  });
});
