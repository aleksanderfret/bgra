import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEngineReadiness } from './useEngineReadiness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEngineReadiness', () => {
  it('starts in starting and becomes ready when health says so', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ components: { reranker: true } }), { status: 200 }),
    );

    const { result } = renderHook(() => useEngineReadiness());

    expect(result.current).toBe('starting');

    await waitFor(() => {
      expect(result.current).toBe('ready');
    });

    await act(async () => {
      await Promise.resolve();
    });
  });
});
