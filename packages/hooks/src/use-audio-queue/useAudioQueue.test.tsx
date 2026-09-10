import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAudioQueue } from './useAudioQueue';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useAudioQueue', () => {
  it('plays frames in sequence order with a gap, and stops clearing the queue', () => {
    vi.useFakeTimers();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const load = vi.fn();
    const removeAttribute = vi.fn();
    let endedHandler: (() => void) | null = null;

    vi.stubGlobal(
      'Audio',
      function MockAudio(this: {
        play: typeof play;
        pause: typeof pause;
        load: typeof load;
        removeAttribute: typeof removeAttribute;
        addEventListener: (type: string, handler: () => void) => void;
        removeEventListener: () => void;
      }) {
        this.play = play;
        this.pause = pause;
        this.load = load;
        this.removeAttribute = removeAttribute;
        this.addEventListener = (type: string, handler: () => void) => {
          if (type === 'ended') {
            endedHandler = handler;
          }
        };
        this.removeEventListener = vi.fn();
      },
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('atob', (value: string) => value);

    const { result } = renderHook(() => useAudioQueue());

    act(() => {
      result.current.enqueue({ sequence: 2, mimeType: 'audio/wav', dataBase64: 'bb' });
      result.current.enqueue({ sequence: 1, mimeType: 'audio/wav', dataBase64: 'aa' });
    });

    expect(result.current.isPlaying).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);

    act(() => {
      endedHandler?.();
    });
    expect(play).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(play).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isPlaying).toBe(false);
    expect(pause).toHaveBeenCalled();
  });
});
