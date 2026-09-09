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

  const revokeUrls = useCallback((): void => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
  }, []);

  const stop = useCallback((): void => {
    generationRef.current += 1;
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
  }, [revokeUrls]);

  const playNext = useCallback((): void => {
    const generation = generationRef.current;
    const next = queueRef.current.shift();
    if (next === undefined) {
      playingRef.current = false;
      setIsPlaying(false);
      return;
    }

    const binary = atob(next.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: next.mimeType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);

    const audio = new Audio(url);
    currentRef.current = audio;
    playingRef.current = true;
    setIsPlaying(true);

    const onEnded = (): void => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onEnded);
      URL.revokeObjectURL(url);
      objectUrlsRef.current = objectUrlsRef.current.filter((entry) => entry !== url);
      if (generation !== generationRef.current) {
        return;
      }
      playNext();
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onEnded);
    void audio.play().catch(() => {
      onEnded();
    });
  }, []);

  const enqueue = useCallback(
    (item: AudioQueueItem): void => {
      queueRef.current.push(item);
      queueRef.current.sort((left, right) => left.sequence - right.sequence);
      if (!playingRef.current) {
        playNext();
      }
    },
    [playNext],
  );

  useEffect(() => stop, [stop]);

  return { isPlaying, enqueue, stop };
};
