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

export function useAskStream(): UseAskStream {
  const [state, setState] = useState<AnswerState>(initialAnswerState);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (request: AskRequest): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Local copy so tokens in one network chunk apply in order; `setState`
    // updater batching would not.
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
        return;
      }
      apply({
        type: 'error',
        code: 'engine_unreachable',
        message: error instanceof Error ? error.message : 'fetch failed for an unknown reason',
      });
    }
  }, []);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    setState(initialAnswerState);
  }, []);

  return { state, ask, cancel };
}
