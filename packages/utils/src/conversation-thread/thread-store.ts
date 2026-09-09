import { isGameId } from '@bga/api-contract';
import {
  type ConversationThread,
  emptyThread,
  parseThread,
  serializeThread,
} from './conversation-thread';

// Renderer keys, not a file under storage/assets — ingest must never see chat.
export const THREAD_STORAGE_PREFIX = 'bga.thread.v1.';

export const threadStorageKey = (gameId: string): string => `${THREAD_STORAGE_PREFIX}${gameId}`;

export const loadThread = (gameId: string, storage: Storage): ConversationThread => {
  if (!isGameId(gameId)) {
    return emptyThread(gameId);
  }
  const raw = storage.getItem(threadStorageKey(gameId));
  if (raw === null) {
    return emptyThread(gameId);
  }
  try {
    return parseThread(JSON.parse(raw), gameId);
  } catch {
    return emptyThread(gameId);
  }
};

export const saveThread = (thread: ConversationThread, storage: Storage): boolean => {
  if (!isGameId(thread.gameId)) {
    return false;
  }
  try {
    storage.setItem(threadStorageKey(thread.gameId), serializeThread(thread));
    return true;
  } catch {
    return false;
  }
};
