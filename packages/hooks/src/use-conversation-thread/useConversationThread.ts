'use client';

import type { AnswerMode } from '@bga/api-contract';
import { type AnswerState, startAnswer } from '@bga/utils/answer-state';
import {
  appendExchange,
  type ConversationThread,
  dropExchange as dropFromThread,
  emptyThread,
  loadThread,
  replaceExchangeQuestion as renameInThread,
  replaceExchangeAnswer,
  saveThread,
} from '@bga/utils/conversation-thread';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface BeginExchangeInput {
  question: string;
  mode: AnswerMode;
  expansionIds: string[];
}

export interface UseConversationThreadOptions {
  storage?: Storage | null;
  now?: () => string;
  createId?: () => string;
}

export interface UseConversationThread {
  thread: ConversationThread;
  lastSaveSucceeded: boolean;
  beginExchange: (input: BeginExchangeInput) => string;
  updateAnswer: (exchangeId: string, answer: AnswerState) => void;
  renameExchangeQuestion: (exchangeId: string, question: string) => void;
  dropExchange: (exchangeId: string) => void;
}

const browserStorage = (): Storage | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage;
};

export const useConversationThread = (
  gameId: string | null,
  options: UseConversationThreadOptions = {},
): UseConversationThread => {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? ((): string => new Date().toISOString());
  const createId = options.createId ?? ((): string => crypto.randomUUID());
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const threadRef = useRef<ConversationThread>(emptyThread(gameId ?? ''));
  const previousGameIdRef = useRef<string | null | undefined>(undefined);
  const [thread, setThread] = useState<ConversationThread>(threadRef.current);
  const [lastSaveSucceeded, setLastSaveSucceeded] = useState(true);

  const apply = useCallback((next: ConversationThread): void => {
    threadRef.current = next;
    setThread(next);
    const streaming = next.exchanges.some((exchange) => exchange.answer.isStreaming);
    const store = storageRef.current;
    if (streaming || next.gameId.length === 0 || store === null) {
      return;
    }
    setLastSaveSucceeded(saveThread(next, store));
  }, []);

  useEffect(() => {
    if (previousGameIdRef.current === gameId) {
      return;
    }
    previousGameIdRef.current = gameId;
    const store = storageRef.current;
    const next =
      gameId === null || store === null ? emptyThread(gameId ?? '') : loadThread(gameId, store);
    threadRef.current = next;
    setThread(next);
  }, [gameId]);

  const beginExchange = useCallback(
    (input: BeginExchangeInput): string => {
      if (gameId === null) {
        return '';
      }
      const id = createId();
      const base = threadRef.current.gameId === gameId ? threadRef.current : emptyThread(gameId);
      apply(
        appendExchange(base, {
          id,
          askedAt: now(),
          question: input.question,
          mode: input.mode,
          expansionIds: input.expansionIds,
          answer: startAnswer(),
        }),
      );
      return id;
    },
    [apply, createId, gameId, now],
  );

  const updateAnswer = useCallback(
    (exchangeId: string, answer: AnswerState): void => {
      if (!threadRef.current.exchanges.some((exchange) => exchange.id === exchangeId)) {
        return;
      }
      apply(replaceExchangeAnswer(threadRef.current, exchangeId, answer));
    },
    [apply],
  );

  const renameExchangeQuestion = useCallback(
    (exchangeId: string, question: string): void => {
      if (!threadRef.current.exchanges.some((exchange) => exchange.id === exchangeId)) {
        return;
      }
      apply(renameInThread(threadRef.current, exchangeId, question));
    },
    [apply],
  );

  const dropExchange = useCallback(
    (exchangeId: string): void => {
      apply(dropFromThread(threadRef.current, exchangeId));
    },
    [apply],
  );

  return {
    thread,
    lastSaveSucceeded,
    beginExchange,
    updateAnswer,
    renameExchangeQuestion,
    dropExchange,
  };
};
