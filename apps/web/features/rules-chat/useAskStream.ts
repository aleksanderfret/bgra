'use client';

import {
  type AskRequest,
  type AssistantEvent,
  createAssistantEventDecoder,
} from '@bga/api-contract';
import { useCallback, useRef, useState } from 'react';
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

/**
 * Drives one question through the engine and folds the response stream into
 * `AnswerState`.
 *
 * State is advanced through a local variable rather than the `useState`
 * updater so that a burst of tokens arriving in a single network chunk is
 * applied in order without depending on React's batching.
 */
export function useAskStream(): UseAskStream {
  const [state, setState] = useState<AnswerState>(initialAnswerState);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (request: AskRequest): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let current = startAnswer();
    setState(current);

    const apply = (event: AssistantEvent): void => {
      current = reduceAssistantEvent(current, event);
      setState(current);
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
          code: `http_${response.status}`,
          message: `Silnik odpowiedział błędem ${response.status}.`,
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

      // A stream that ends without a `done` event means the engine died
      // mid-answer; say so instead of leaving a spinner running forever.
      if (current.isStreaming) {
        apply({
          type: 'error',
          code: 'stream_truncated',
          message: 'Strumień odpowiedzi urwał się przed zakończeniem.',
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      apply({
        type: 'error',
        code: 'engine_unreachable',
        message:
          error instanceof Error
            ? error.message
            : 'Nie udało się połączyć z lokalnym silnikiem RAG.',
      });
    }
  }, []);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    setState(initialAnswerState);
  }, []);

  return { state, ask, cancel };
}
