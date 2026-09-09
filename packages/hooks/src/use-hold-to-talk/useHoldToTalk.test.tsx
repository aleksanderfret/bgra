import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHoldToTalk } from './useHoldToTalk';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stubAudioContext = (): void => {
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
      close: () => Promise<void>;
    }) {
      this.sampleRate = 16_000;
      this.state = 'running';
      this.createMediaStreamSource = () => ({ connect: vi.fn() });
      this.createScriptProcessor = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      });
      this.createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
      this.destination = {};
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
});
