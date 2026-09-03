'use client';

import {
  type AskRequest,
  type AssistantEvent,
  createAssistantEventDecoder,
} from '@bga/api-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AnswerState,
  initialAnswerState,
  reduceAssistantEvent,
  startAnswer,
} from './answer-state';

export interface UseAskStream {
  state: AnswerState;
  ask: (request: AskRequest) => Promise<void>;
  cancel: () => void;
}

/** A repaint per token makes a long answer stutter on a machine already busy
 * running the model. Slow enough to coalesce, fast enough to still read as
 * typing. */
const TOKEN_FLUSH_MS = 50;

export function useAskStream(): UseAskStream {
  const [state, setState] = useState<AnswerState>(initialAnswerState);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending flush belongs to the answer that scheduled it. Left running, it
  // would repaint a cancelled or superseded answer 50 ms later.
  const stopFlushing = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopFlushing, [stopFlushing]);

  const ask = useCallback(
    async (request: AskRequest): Promise<void> => {
      abortRef.current?.abort();
      stopFlushing();
      const controller = new AbortController();
      abortRef.current = controller;

      // Local copy so tokens in one network chunk apply in order; `setState`
      // updater batching would not.
      let current = startAnswer();
      setState(current);

      const flush = (): void => {
        stopFlushing();
        setState(current);
      };

      const apply = (event: AssistantEvent): void => {
        current = reduceAssistantEvent(current, event);
        // Every frame that is not a token changes what is on screen — sources
        // before the first word, an error instead of the answer — and showing
        // it late would be wrong, not just slow.
        if (event.type === 'token') {
          flushTimerRef.current ??= setTimeout(flush, TOKEN_FLUSH_MS);
          return;
        }
        flush();
      };

      try {
        const response = await fetch('/api/engine/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

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

        // No `done` frame means the engine died mid-answer; otherwise the
        // spinner never stops.
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
}
