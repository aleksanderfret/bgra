'use client';

import {
  type AssistantEvent,
  createAssistantEventDecoder,
  type LessonAskRequest,
  type LessonSession,
  type LessonSessionRequest,
  type LessonStartRequest,
} from '@bga/api-contract';
import {
  type AnswerState,
  initialAnswerState,
  reduceAssistantEvent,
  startAnswer,
} from '@bga/utils/answer-state';
import { isLessonActiveResponse } from '@bga/utils/lesson-session';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseLessonStream {
  state: AnswerState;
  sessionId: string | null;
  session: LessonSession | null;
  start: (gameId: string, expansionIds?: readonly string[]) => Promise<void>;
  continue: (sessionId: string) => Promise<void>;
  repeat: (sessionId: string) => Promise<void>;
  ask: (sessionId: string, question: string) => Promise<void>;
  cancel: () => void;
  syncActive: (gameId: string) => Promise<LessonSession | null>;
}

/** Same coalesce window as ask stream — one paint per token would stutter. */
const TOKEN_FLUSH_MS = 50;

export const loadActive = async (gameId: string): Promise<LessonSession | null> => {
  const response = await fetch(`/api/engine/lesson/active?gameId=${encodeURIComponent(gameId)}`);
  if (!response.ok) {
    return null;
  }
  const payload: unknown = await response.json();
  if (!isLessonActiveResponse(payload)) {
    return null;
  }
  return payload.session;
};

export const useLessonStream = (): UseLessonStream => {
  const [state, setState] = useState<AnswerState>(initialAnswerState);
  const [session, setSession] = useState<LessonSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncGameIdRef = useRef<string | null>(null);

  const stopFlushing = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopFlushing();
    };
  }, [stopFlushing]);

  const syncActive = useCallback(async (gameId: string): Promise<LessonSession | null> => {
    try {
      const next = await loadActive(gameId);
      setSession(next);
      return next;
    } catch {
      setSession(null);
      return null;
    }
  }, []);

  const runStream = useCallback(
    async (
      path: string,
      body: LessonStartRequest | LessonSessionRequest | LessonAskRequest,
    ): Promise<void> => {
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
        current = reduceAssistantEvent(current, event);
        if (event.type === 'token') {
          flushTimerRef.current ??= setTimeout(flush, TOKEN_FLUSH_MS);
          return;
        }
        flush();
      };

      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
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
      } finally {
        const gameId = syncGameIdRef.current;
        if (gameId !== null && !controller.signal.aborted) {
          await syncActive(gameId);
        }
      }
    },
    [stopFlushing, syncActive],
  );

  const start = useCallback(
    async (gameId: string, expansionIds?: readonly string[]): Promise<void> => {
      syncGameIdRef.current = gameId;
      const body: LessonStartRequest = { gameId };
      if (expansionIds !== undefined && expansionIds.length > 0) {
        body.expansionIds = [...expansionIds];
      }
      await runStream('/api/engine/lesson/start', body);
    },
    [runStream],
  );

  const continueSession = useCallback(
    async (sessionId: string): Promise<void> => {
      const body: LessonSessionRequest = { sessionId };
      await runStream('/api/engine/lesson/continue', body);
    },
    [runStream],
  );

  const repeat = useCallback(
    async (sessionId: string): Promise<void> => {
      const body: LessonSessionRequest = { sessionId };
      await runStream('/api/engine/lesson/repeat', body);
    },
    [runStream],
  );

  const ask = useCallback(
    async (sessionId: string, question: string): Promise<void> => {
      const body: LessonAskRequest = { sessionId, question };
      await runStream('/api/engine/lesson/ask', body);
    },
    [runStream],
  );

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    stopFlushing();
    setState(initialAnswerState);
  }, [stopFlushing]);

  return {
    state,
    sessionId: session?.sessionId ?? null,
    session,
    start,
    continue: continueSession,
    repeat,
    ask,
    cancel,
    syncActive,
  };
};
