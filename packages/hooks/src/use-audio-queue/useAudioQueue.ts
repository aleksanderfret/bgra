'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioQueueItem {
  sequence: number;
  mimeType: string;
  dataBase64: string;
}

export interface UseAudioQueue {
  isPlaying: boolean;
  enqueue: (item: AudioQueueItem) => void;
  stop: () => void;
}

/** Pause between sentences so endings are not swallowed by the next clip. */
const INTER_CLIP_GAP_MS = 320;

/**
 * Plays SSE `audio` frames in `sequence` order. `stop()` aborts immediately
 * (new mic hold / new typed question).
 */
export const useAudioQueue = (): UseAudioQueue => {
  const [isPlaying, setIsPlaying] = useState(false);
  const queueRef = useRef<AudioQueueItem[]>([]);
  const currentRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);
  const generationRef = useRef(0);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playNextRef = useRef<() => void>(() => undefined);

  const clearGapTimer = useCallback((): void => {
    if (gapTimerRef.current !== null) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }, []);

  const revokeUrls = useCallback((): void => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
  }, []);

  const stop = useCallback((): void => {
    generationRef.current += 1;
    clearGapTimer();
    queueRef.current = [];
    playingRef.current = false;
    setIsPlaying(false);
    const current = currentRef.current;
    currentRef.current = null;
    if (current !== null) {
      current.pause();
      current.removeAttribute('src');
      current.load();
    }
    revokeUrls();
  }, [clearGapTimer, revokeUrls]);

  const playNext = useCallback((): void => {
    const generation = generationRef.current;
    const next = queueRef.current.shift();
    if (next === undefined) {
      playingRef.current = false;
      setIsPlaying(false);
      return;
    }

    let url: string;
    try {
      const binary = atob(next.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: next.mimeType || 'audio/wav' });
      url = URL.createObjectURL(blob);
      objectUrlsRef.current.push(url);
    } catch {
      if (generation !== generationRef.current) {
        return;
      }
      playingRef.current = false;
      playNextRef.current();
      return;
    }

    const audio = new Audio(url);
    currentRef.current = audio;
    playingRef.current = true;
    setIsPlaying(true);

    const advanceAfterGap = (): void => {
      if (generation !== generationRef.current) {
        return;
      }
      clearGapTimer();
      gapTimerRef.current = setTimeout(() => {
        gapTimerRef.current = null;
        if (generation !== generationRef.current) {
          return;
        }
        playNextRef.current();
      }, INTER_CLIP_GAP_MS);
    };

    const onEnded = (): void => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      URL.revokeObjectURL(url);
      objectUrlsRef.current = objectUrlsRef.current.filter((entry) => entry !== url);
      if (generation !== generationRef.current) {
        return;
      }
      advanceAfterGap();
    };

    const onError = (): void => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      URL.revokeObjectURL(url);
      objectUrlsRef.current = objectUrlsRef.current.filter((entry) => entry !== url);
      if (generation !== generationRef.current) {
        return;
      }
      advanceAfterGap();
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    void audio.play().catch(() => {
      onError();
    });
  }, [clearGapTimer]);

  playNextRef.current = playNext;

  const enqueue = useCallback((item: AudioQueueItem): void => {
    queueRef.current.push(item);
    queueRef.current.sort((left, right) => left.sequence - right.sequence);
    if (!playingRef.current) {
      playNextRef.current();
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { isPlaying, enqueue, stop };
};
