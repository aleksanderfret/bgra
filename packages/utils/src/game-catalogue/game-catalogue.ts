import type { GameCatalogueItem } from '@bga/api-contract';

export type GamePickerLocale = 'en' | 'pl';

export type GamePickerRow =
  | { type: 'header'; id: 'recent' | 'all' | 'results' }
  | { type: 'game'; game: GameCatalogueItem };

export interface BuildPickerSectionsOptions {
  games: readonly GameCatalogueItem[];
  recentIds: readonly string[];
  query: string;
  locale: GamePickerLocale;
  basesOnly?: boolean;
}

export const createGameCollator = (locale: GamePickerLocale): Intl.Collator =>
  new Intl.Collator(locale, { sensitivity: 'base', numeric: true });

/** Fold case and strip combining marks so “Blu” matches “Blü”. */
export const foldGameText = (value: string, locale: GamePickerLocale): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);

export const sortGamesByTitle = (
  games: readonly GameCatalogueItem[],
  locale: GamePickerLocale,
): GameCatalogueItem[] => {
  const collator = createGameCollator(locale);
  return [...games].sort((left, right) => collator.compare(left.title, right.title));
};

export const filterGamesByQuery = (
  games: readonly GameCatalogueItem[],
  query: string,
  locale: GamePickerLocale,
): GameCatalogueItem[] => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [...games];
  }
  const needle = foldGameText(trimmed, locale);
  return games.filter((game) => foldGameText(game.title, locale).includes(needle));
};

export const buildPickerSections = (options: BuildPickerSectionsOptions): GamePickerRow[] => {
  const { recentIds, query, locale } = options;
  const basesOnly = options.basesOnly === true;
  const pool = options.games.filter((game) => (basesOnly ? game.baseGameId === null : true));
  const known = new Set(pool.map((game) => game.gameId));
  const trimmed = query.trim();

  if (trimmed.length > 0) {
    const results = sortGamesByTitle(filterGamesByQuery(pool, trimmed, locale), locale);
    if (results.length === 0) {
      return [];
    }
    return [
      { type: 'header', id: 'results' },
      ...results.map((game) => ({ type: 'game' as const, game })),
    ];
  }

  const recentGames: GameCatalogueItem[] = [];
  for (const id of recentIds) {
    if (!known.has(id)) {
      continue;
    }
    const match = pool.find((game) => game.gameId === id);
    if (match !== undefined) {
      recentGames.push(match);
    }
  }

  const recentSet = new Set(recentGames.map((game) => game.gameId));
  const allGames = sortGamesByTitle(
    pool.filter((game) => !recentSet.has(game.gameId)),
    locale,
  );

  const rows: GamePickerRow[] = [];
  if (recentGames.length > 0) {
    rows.push({ type: 'header', id: 'recent' });
    for (const game of recentGames) {
      rows.push({ type: 'game', game });
    }
  }
  if (allGames.length > 0) {
    rows.push({ type: 'header', id: 'all' });
    for (const game of allGames) {
      rows.push({ type: 'game', game });
    }
  }
  return rows;
};
