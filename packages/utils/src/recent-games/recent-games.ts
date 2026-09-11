import { isGameId } from '@bga/api-contract';

/** MRU list of game ids for the game picker (max 10). */
export const RECENT_GAMES_STORAGE_KEY = 'bga.games.recent.v1';

export const MAX_RECENT_GAMES = 10;

const parseRecentIds = (raw: string | null): string[] => {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string' && isGameId(item) && !ids.includes(item)) {
        ids.push(item);
      }
      if (ids.length >= MAX_RECENT_GAMES) {
        break;
      }
    }
    return ids;
  } catch {
    return [];
  }
};

export const loadRecentGameIds = (storage: Storage): string[] => {
  try {
    return parseRecentIds(storage.getItem(RECENT_GAMES_STORAGE_KEY));
  } catch {
    return [];
  }
};

export const recordRecentGame = (gameId: string, storage: Storage): void => {
  if (!isGameId(gameId)) {
    return;
  }
  try {
    const next = [gameId, ...loadRecentGameIds(storage).filter((id) => id !== gameId)].slice(
      0,
      MAX_RECENT_GAMES,
    );
    storage.setItem(RECENT_GAMES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — recent list stays in-memory only for this page.
  }
};
