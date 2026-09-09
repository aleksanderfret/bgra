import { isGameId } from '@bga/api-contract';
import { initialAnswerState } from '@bga/utils/answer-state';
import { describe, expect, it } from 'vitest';
import { appendExchange, emptyThread, type ThreadExchange } from './conversation-thread';
import { loadThread, saveThread, THREAD_STORAGE_PREFIX, threadStorageKey } from './thread-store';

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
};

const exchange: ThreadExchange = {
  id: 'a',
  askedAt: '2026-09-09T10:00:00.000Z',
  question: 'How do I score?',
  mode: 'arbitrate',
  expansionIds: [],
  answer: { ...initialAnswerState, text: 'Four tiles.' },
};

describe('thread-store', () => {
  it('keys storage by game id so Azul never reads Wingspan', () => {
    expect(threadStorageKey('azul')).toBe(`${THREAD_STORAGE_PREFIX}azul`);
    expect(isGameId('azul')).toBe(true);
  });

  it('saves and reloads one game without mixing another', () => {
    const storage = memoryStorage();
    expect(saveThread(appendExchange(emptyThread('azul'), exchange), storage)).toBe(true);

    expect(loadThread('azul', storage).exchanges[0]?.question).toBe('How do I score?');
    expect(loadThread('wingspan', storage).exchanges).toEqual([]);
  });

  it('does not write when the game id is not a slug', () => {
    const storage = memoryStorage();
    expect(saveThread(appendExchange(emptyThread('../x'), exchange), storage)).toBe(false);
    expect(storage.length).toBe(0);
    expect(loadThread('../x', storage).exchanges).toEqual([]);
  });

  it('treats corrupt JSON as an empty thread for that game', () => {
    const storage = memoryStorage();
    storage.setItem(threadStorageKey('azul'), '{not json');
    expect(loadThread('azul', storage).exchanges).toEqual([]);
  });

  it('returns false and keeps the previous key when setItem throws', () => {
    const storage = memoryStorage();
    expect(saveThread(appendExchange(emptyThread('azul'), exchange), storage)).toBe(true);

    storage.setItem = (): void => {
      throw new Error('QuotaExceededError');
    };

    expect(saveThread(appendExchange(emptyThread('azul'), exchange), storage)).toBe(false);
    expect(loadThread('azul', storage).exchanges[0]?.question).toBe('How do I score?');
  });
});
