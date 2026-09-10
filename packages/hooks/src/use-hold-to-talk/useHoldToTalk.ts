'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TARGET_RATE = 16_000;
const MAX_SECONDS = 30;
/** Below this after a real hold, treat as empty and tell the player. */
const MIN_PCM_SAMPLES = TARGET_RATE * 0.15;

export type HoldToTalkErrorCode = 'mic_denied' | 'mic_unavailable' | 'recording_empty';

export interface UseHoldToTalk {
  isHolding: boolean;
  isSupported: boolean;
  errorCode: HoldToTalkErrorCode | null;
  /** Pointer/mouse/touch: press and hold the mic control. */
  onPressStart: () => void;
  onPressEnd: () => void;
}

export interface UseHoldToTalkOptions {
  /** Called with 16 kHz mono PCM WAV when the player releases. */
  onRecordingComplete: (wav: Blob) => void;
  /** Clear any playing TTS when a new hold begins. */
  onHoldStart?: () => void;
  disabled?: boolean;
}

const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
};

const floatTo16BitPcm = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

const downsample = (input: Float32Array, inputRate: number, outputRate: number): Float32Array => {
  if (inputRate === outputRate) {
    return input;
  }
  const ratio = inputRate / outputRate;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let index = 0; index < newLength; index += 1) {
    result[index] = input[Math.floor(index * ratio)] ?? 0;
  }
  return result;
};

const encodeWav = (samples: Int16Array, sampleRate: number): Blob => {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(offset, samples[index] ?? 0, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const rmsLevel = (samples: Int16Array): number => {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length) / 0x8000;
};

export const useHoldToTalk = (options: UseHoldToTalkOptions): UseHoldToTalk => {
  const { onRecordingComplete, onHoldStart, disabled = false } = options;
  const [isHolding, setIsHolding] = useState(false);
  const [errorCode, setErrorCode] = useState<HoldToTalkErrorCode | null>(null);
  const isSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof AudioContext !== 'undefined';

  const holdingRef = useRef(false);
  const startingRef = useRef(false);
  const cancelledStartRef = useRef(false);
  const chunksRef = useRef<Float32Array[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleRateRef = useRef(TARGET_RATE);
  const startedAtRef = useRef(0);
  const windowReleaseAttachedRef = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;
  const onHoldStartRef = useRef(onHoldStart);
  onHoldStartRef.current = onHoldStart;
  const finishRecordingRef = useRef<() => void>(() => undefined);

  const teardown = useCallback((): void => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context !== null && context.state !== 'closed') {
      void context.close();
    }
  }, []);

  const onWindowReleaseRef = useRef((): void => {
    if (!windowReleaseAttachedRef.current) {
      return;
    }
    windowReleaseAttachedRef.current = false;
    window.removeEventListener('pointerup', onWindowReleaseRef.current);
    window.removeEventListener('pointercancel', onWindowReleaseRef.current);
    finishRecordingRef.current();
  });

  const detachWindowRelease = useCallback((): void => {
    if (!windowReleaseAttachedRef.current) {
      return;
    }
    windowReleaseAttachedRef.current = false;
    window.removeEventListener('pointerup', onWindowReleaseRef.current);
    window.removeEventListener('pointercancel', onWindowReleaseRef.current);
  }, []);

  const attachWindowRelease = useCallback((): void => {
    if (windowReleaseAttachedRef.current) {
      return;
    }
    windowReleaseAttachedRef.current = true;
    window.addEventListener('pointerup', onWindowReleaseRef.current);
    window.addEventListener('pointercancel', onWindowReleaseRef.current);
  }, []);

  const finishRecording = useCallback((): void => {
    detachWindowRelease();
    // Release while getUserMedia / graph setup is still in flight.
    if (startingRef.current) {
      cancelledStartRef.current = true;
      return;
    }
    if (!holdingRef.current) {
      return;
    }
    holdingRef.current = false;
    setIsHolding(false);

    const chunks = chunksRef.current;
    chunksRef.current = [];
    const inputRate = sampleRateRef.current;
    teardown();

    if (chunks.length === 0) {
      setErrorCode('recording_empty');
      return;
    }
    let total = 0;
    for (const chunk of chunks) {
      total += chunk.length;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const downsampled = downsample(merged, inputRate, TARGET_RATE);
    const pcm = floatTo16BitPcm(downsampled);
    if (pcm.length < MIN_PCM_SAMPLES || rmsLevel(pcm) < 0.004) {
      setErrorCode('recording_empty');
      return;
    }
    onRecordingCompleteRef.current(encodeWav(pcm, TARGET_RATE));
  }, [detachWindowRelease, teardown]);

  finishRecordingRef.current = finishRecording;

  const startRecording = useCallback(async (): Promise<void> => {
    if (disabledRef.current || holdingRef.current || startingRef.current || !isSupported) {
      return;
    }
    startingRef.current = true;
    cancelledStartRef.current = false;
    onHoldStartRef.current?.();
    setErrorCode(null);
    attachWindowRelease();

    // Create (and resume) inside the press gesture, before any await, so the
    // graph is allowed to run. Creating after getUserMedia often stays suspended.
    const context = new AudioContext();
    contextRef.current = context;
    sampleRateRef.current = context.sampleRate;
    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (cancelledStartRef.current || disabledRef.current) {
        startingRef.current = false;
        cancelledStartRef.current = false;
        detachWindowRelease();
        teardown();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledStartRef.current || disabledRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        startingRef.current = false;
        cancelledStartRef.current = false;
        detachWindowRelease();
        teardown();
        return;
      }
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (cancelledStartRef.current || disabledRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        startingRef.current = false;
        cancelledStartRef.current = false;
        detachWindowRelease();
        teardown();
        return;
      }
      const source = context.createMediaStreamSource(stream);
      // ScriptProcessor is deprecated but widely available without a worklet file.
      const processor = context.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      processor.onaudioprocess = (event: AudioProcessingEvent): void => {
        if (!holdingRef.current) {
          return;
        }
        if (Date.now() - startedAtRef.current > MAX_SECONDS * 1000) {
          finishRecordingRef.current();
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };
      source.connect(processor);
      // Keep the graph alive without routing mic audio to speakers (echo).
      const silence = context.createGain();
      silence.gain.value = 0;
      processor.connect(silence);
      silence.connect(context.destination);
      streamRef.current = stream;
      processorRef.current = processor;

      if (cancelledStartRef.current || disabledRef.current) {
        startingRef.current = false;
        cancelledStartRef.current = false;
        detachWindowRelease();
        teardown();
        return;
      }
      // Mark holding before clearing "starting" so a release never lands in a
      // gap where both flags are false (that used to leave Listening stuck on).
      holdingRef.current = true;
      startingRef.current = false;
      setIsHolding(true);
    } catch (error) {
      startingRef.current = false;
      cancelledStartRef.current = false;
      holdingRef.current = false;
      setIsHolding(false);
      detachWindowRelease();
      teardown();
      const name = error instanceof DOMException ? error.name : '';
      setErrorCode(name === 'NotAllowedError' ? 'mic_denied' : 'mic_unavailable');
    }
  }, [attachWindowRelease, detachWindowRelease, isSupported, teardown]);

  const onPressStart = useCallback((): void => {
    void startRecording();
  }, [startRecording]);

  const onPressEnd = useCallback((): void => {
    finishRecording();
  }, [finishRecording]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat || disabledRef.current) {
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void startRecording();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') {
        return;
      }
      if (holdingRef.current || startingRef.current) {
        event.preventDefault();
        finishRecordingRef.current();
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      event.preventDefault();
      finishRecordingRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startRecording]);

  useEffect(() => {
    return () => {
      cancelledStartRef.current = true;
      startingRef.current = false;
      holdingRef.current = false;
      detachWindowRelease();
      teardown();
    };
  }, [detachWindowRelease, teardown]);

  return {
    isHolding,
    isSupported,
    errorCode,
    onPressStart,
    onPressEnd,
  };
};
