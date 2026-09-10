import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHoldToTalk } from './useHoldToTalk';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stubAudioContext = (options?: { startSuspended?: boolean }): void => {
  const startSuspended = options?.startSuspended === true;
  vi.stubGlobal(
    'AudioContext',
    function MockAudioContext(this: {
      sampleRate: number;
      state: string;
      createMediaStreamSource: () => { connect: () => void };
      createScriptProcessor: () => {
        connect: () => void;
        disconnect: () => void;
        onaudioprocess: null;
      };
      createGain: () => { gain: { value: number }; connect: () => void };
      destination: object;
      resume: () => Promise<void>;
      close: () => Promise<void>;
    }) {
      this.sampleRate = 16_000;
      this.state = startSuspended ? 'suspended' : 'running';
      this.createMediaStreamSource = () => ({ connect: vi.fn() });
      this.createScriptProcessor = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      });
      this.createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
      this.destination = {};
      this.resume = vi.fn().mockImplementation(async () => {
        this.state = 'running';
      });
      this.close = vi.fn().mockResolvedValue(undefined);
    },
  );
};

describe('useHoldToTalk', () => {
  it('cancels when release happens before getUserMedia resolves', async () => {
    let resolveMedia: ((stream: MediaStream) => void) | null = null;
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              resolveMedia = resolve;
            }),
        ),
      },
    });
    stubAudioContext();

    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() => useHoldToTalk({ onRecordingComplete, disabled: false }));

    act(() => {
      result.current.onPressStart();
    });
    act(() => {
      result.current.onPressEnd();
    });

    await act(async () => {
      resolveMedia?.(stream);
      await Promise.resolve();
    });

    expect(result.current.isHolding).toBe(false);
    expect(onRecordingComplete).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('ends hold on Space keyup even when the event comes from a text field', async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    stubAudioContext();

    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() => useHoldToTalk({ onRecordingComplete }));

    act(() => {
      result.current.onPressStart();
    });
    await waitFor(() => {
      expect(result.current.isHolding).toBe(true);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    });

    expect(result.current.isHolding).toBe(false);
    document.body.removeChild(input);
  });

  it('keeps Listening until release when onRecordingComplete identity changes mid-hold', async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    stubAudioContext();

    const { result, rerender } = renderHook(
      ({ onRecordingComplete }: { onRecordingComplete: (wav: Blob) => void }) =>
        useHoldToTalk({ onRecordingComplete }),
      { initialProps: { onRecordingComplete: vi.fn() } },
    );

    act(() => {
      result.current.onPressStart();
    });
    await waitFor(() => {
      expect(result.current.isHolding).toBe(true);
    });

    rerender({ onRecordingComplete: vi.fn() });
    expect(result.current.isHolding).toBe(true);

    act(() => {
      result.current.onPressEnd();
    });
    expect(result.current.isHolding).toBe(false);
  });

  it('reports recording_empty when a completed hold captured no audio', async () => {
    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    stubAudioContext();

    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() => useHoldToTalk({ onRecordingComplete }));

    act(() => {
      result.current.onPressStart();
    });
    await waitFor(() => {
      expect(result.current.isHolding).toBe(true);
    });

    act(() => {
      result.current.onPressEnd();
    });

    expect(result.current.isHolding).toBe(false);
    expect(result.current.errorCode).toBe('recording_empty');
    expect(onRecordingComplete).not.toHaveBeenCalled();
  });

  it('resumes a suspended AudioContext before capturing', async () => {
    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    stubAudioContext({ startSuspended: true });

    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() => useHoldToTalk({ onRecordingComplete }));

    act(() => {
      result.current.onPressStart();
    });
    await waitFor(() => {
      expect(result.current.isHolding).toBe(true);
    });
  });
});
