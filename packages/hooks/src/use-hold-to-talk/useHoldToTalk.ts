'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TARGET_RATE = 16_000;
const MAX_SECONDS = 30;

export interface UseHoldToTalk {
  isHolding: boolean;
  isSupported: boolean;
  errorCode: 'mic_denied' | 'mic_unavailable' | null;
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

export const useHoldToTalk = (options: UseHoldToTalkOptions): UseHoldToTalk => {
  const { onRecordingComplete, onHoldStart, disabled = false } = options;
  const [isHolding, setIsHolding] = useState(false);
  const [errorCode, setErrorCode] = useState<'mic_denied' | 'mic_unavailable' | null>(null);
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

  const finishRecording = useCallback((): void => {
    if (startingRef.current && !holdingRef.current) {
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
    if (pcm.length === 0) {
      return;
    }
    onRecordingComplete(encodeWav(pcm, TARGET_RATE));
  }, [onRecordingComplete, teardown]);

  const startRecording = useCallback(async (): Promise<void> => {
    if (disabled || holdingRef.current || startingRef.current || !isSupported) {
      return;
    }
    startingRef.current = true;
    cancelledStartRef.current = false;
    onHoldStart?.();
    setErrorCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledStartRef.current || disabled) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        startingRef.current = false;
        cancelledStartRef.current = false;
        return;
      }
      const context = new AudioContext();
      sampleRateRef.current = context.sampleRate;
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
          finishRecording();
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
      contextRef.current = context;
      processorRef.current = processor;
      startingRef.current = false;
      if (cancelledStartRef.current) {
        cancelledStartRef.current = false;
        teardown();
        return;
      }
      holdingRef.current = true;
      setIsHolding(true);
    } catch (error) {
      startingRef.current = false;
      cancelledStartRef.current = false;
      teardown();
      const name = error instanceof DOMException ? error.name : '';
      setErrorCode(name === 'NotAllowedError' ? 'mic_denied' : 'mic_unavailable');
    }
  }, [disabled, finishRecording, isSupported, onHoldStart, teardown]);

  const onPressStart = useCallback((): void => {
    void startRecording();
  }, [startRecording]);

  const onPressEnd = useCallback((): void => {
    finishRecording();
  }, [finishRecording]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat || disabled) {
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
      // Always end an in-flight hold even if focus moved into a text field.
      if (holdingRef.current || startingRef.current) {
        event.preventDefault();
        finishRecording();
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      event.preventDefault();
      finishRecording();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelledStartRef.current = true;
      startingRef.current = false;
      holdingRef.current = false;
      teardown();
    };
  }, [disabled, finishRecording, startRecording, teardown]);

  return {
    isHolding,
    isSupported,
    errorCode,
    onPressStart,
    onPressEnd,
  };
};
