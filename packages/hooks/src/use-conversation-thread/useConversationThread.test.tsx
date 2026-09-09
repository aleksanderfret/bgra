import { initialAnswerState, startAnswer } from '@bga/utils/answer-state';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConversationThread } from './useConversationThread';

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

describe('useConversationThread', () => {
  it('reloads a finished exchange when the same game is selected again', () => {
    const storage = memoryStorage();
    const { result, rerender } = renderHook(
      ({ gameId }: { gameId: string | null }) =>
        useConversationThread(gameId, {
          storage,
          now: () => '2026-09-09T10:00:00.000Z',
          createId: () => 'ex-1',
        }),
      { initialProps: { gameId: 'azul' } },
    );

    act(() => {
      result.current.beginExchange({
        question: 'How do I score?',
        mode: 'arbitrate',
        expansionIds: [],
      });
      result.current.updateAnswer('ex-1', {
        ...initialAnswerState,
        text: 'Four tiles.',
      });
    });

    rerender({ gameId: 'wingspan' });
    expect(result.current.thread.exchanges).toEqual([]);

    rerender({ gameId: 'azul' });
    expect(result.current.thread.exchanges[0]?.question).toBe('How do I score?');
    expect(result.current.thread.exchanges[0]?.answer.text).toBe('Four tiles.');
  });

  it('does not persist a streaming answer, and drop removes it', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() =>
      useConversationThread('azul', {
        storage,
        now: () => '2026-09-09T10:00:00.000Z',
        createId: () => 'ex-1',
      }),
    );

    act(() => {
      result.current.beginExchange({
        question: 'Q',
        mode: 'teach',
        expansionIds: ['azul-crystal'],
      });
      result.current.updateAnswer('ex-1', startAnswer());
    });
    expect(storage.length).toBe(0);
    expect(result.current.lastSaveSucceeded).toBe(true);

    act(() => {
      result.current.dropExchange('ex-1');
    });
    expect(result.current.thread.exchanges).toEqual([]);
  });

  it('sets lastSaveSucceeded false when setItem throws', () => {
    const storage = memoryStorage();
    storage.setItem = (): void => {
      throw new Error('QuotaExceededError');
    };
    const { result } = renderHook(() =>
      useConversationThread('azul', {
        storage,
        now: () => '2026-09-09T10:00:00.000Z',
        createId: () => 'ex-1',
      }),
    );

    act(() => {
      result.current.beginExchange({
        question: 'Q',
        mode: 'arbitrate',
        expansionIds: [],
      });
      result.current.updateAnswer('ex-1', {
        ...initialAnswerState,
        text: 'Four tiles.',
      });
    });

    expect(result.current.lastSaveSucceeded).toBe(false);
    expect(result.current.thread.exchanges[0]?.answer.text).toBe('Four tiles.');
  });
});
