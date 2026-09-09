'use client';

import {
  type AskRequest,
  type AssistantEvent,
  createAssistantEventDecoder,
} from '@bga/api-contract';
import {
  type AnswerState,
  initialAnswerState,
  reduceAssistantEvent,
  startAnswer,
} from '@bga/utils/answer-state';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AskAudioFrame {
  sequence: number;
  mimeType: string;
  dataBase64: string;
}

export interface AskOptions {
  audio?: Blob;
  onAudio?: (frame: AskAudioFrame) => void;
}

export interface UseAskStream {
  state: AnswerState;
  ask: (request: AskRequest, options?: AskOptions) => Promise<void>;
  cancel: () => void;
}

/** A repaint per token makes a long answer stutter on a machine already busy
 * running the model. Slow enough to coalesce, fast enough to still read as
 * typing. */
const TOKEN_FLUSH_MS = 50;

export const useAskStream = (): UseAskStream => {
  const [state, setState] = useState<AnswerState>(initialAnswerState);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFlushing = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopFlushing, [stopFlushing]);

  const ask = useCallback(
    async (request: AskRequest, options?: AskOptions): Promise<void> => {
      abortRef.current?.abort();
      stopFlushing();
      const controller = new AbortController();
      abortRef.current = controller;

      let current = startAnswer();
      setState(current);

      const flush = (): void => {
        stopFlushing();
        setState(current);
      };

      const apply = (event: AssistantEvent): void => {
        if (event.type === 'audio') {
          options?.onAudio?.({
            sequence: event.sequence,
            mimeType: event.mimeType,
            dataBase64: event.dataBase64,
          });
          return;
        }
        current = reduceAssistantEvent(current, event);
        if (event.type === 'token') {
          flushTimerRef.current ??= setTimeout(flush, TOKEN_FLUSH_MS);
          return;
        }
        flush();
      };

      try {
        let response: Response;
        if (options?.audio !== undefined) {
          const form = new FormData();
          form.set('gameId', request.gameId);
          form.set('mode', request.mode);
          form.set('speak', request.speak === true ? 'true' : 'false');
          form.set('locale', request.locale ?? 'en');
          if (request.expansionIds !== undefined && request.expansionIds.length > 0) {
            form.set('expansionIds', JSON.stringify(request.expansionIds));
          }
          if (request.question.length > 0) {
            form.set('question', request.question);
          }
          form.set('audio', options.audio, 'utterance.wav');
          response = await fetch('/api/engine/ask', {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });
        } else {
          response = await fetch('/api/engine/ask', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
          });
        }

        if (!response.ok || response.body === null) {
          apply({
            type: 'error',
            code: 'http_error',
            message: `Engine responded with HTTP ${response.status}.`,
          });
          return;
        }

        const decoder = createAssistantEventDecoder();
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

        let chunk = await reader.read();
        while (chunk.done !== true) {
          for (const event of decoder.push(chunk.value)) {
            apply(event);
          }
          chunk = await reader.read();
        }

        if (current.isStreaming) {
          apply({
            type: 'error',
            code: 'stream_truncated',
            message: 'The event stream ended without a `done` frame.',
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          stopFlushing();
          return;
        }
        apply({
          type: 'error',
          code: 'engine_unreachable',
          message: error instanceof Error ? error.message : 'fetch failed for an unknown reason',
        });
      }
    },
    [stopFlushing],
  );

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    stopFlushing();
    setState(initialAnswerState);
  }, [stopFlushing]);

  return { state, ask, cancel };
};
