import { describe, expect, it } from 'vitest';
import { buildPickerSections, filterGamesByQuery, sortGamesByTitle } from './game-catalogue';

const games = [
  { gameId: 'azul', title: 'Azul', baseGameId: null },
  { gameId: 'ogrod', title: 'Ogród', baseGameId: null },
  { gameId: 'blucher', title: 'Blücher', baseGameId: null },
  { gameId: 'azul-exp', title: 'Azul: Summer Pavilion', baseGameId: 'azul' },
];

describe('sortGamesByTitle', () => {
  it('orders with locale-aware diacritics for Polish', () => {
    const titles = sortGamesByTitle(games, 'pl').map((game) => game.title);
    expect(titles.indexOf('Azul')).toBeLessThan(titles.indexOf('Blücher'));
    expect(titles.indexOf('Blücher')).toBeLessThan(titles.indexOf('Ogród'));
  });
});

describe('filterGamesByQuery', () => {
  it('matches folded diacritics', () => {
    expect(filterGamesByQuery(games, 'blu', 'en').map((game) => game.gameId)).toContain('blucher');
    expect(filterGamesByQuery(games, 'ogro', 'pl').map((game) => game.gameId)).toContain('ogrod');
  });
});

describe('buildPickerSections', () => {
  it('puts recent first, drops stale ids, and lists the rest under all', () => {
    const rows = buildPickerSections({
      games,
      recentIds: ['ogrod', 'missing', 'azul'],
      query: '',
      locale: 'pl',
      basesOnly: true,
    });
    expect(rows[0]).toEqual({ type: 'header', id: 'recent' });
    expect(rows[1]).toMatchObject({ type: 'game', game: { gameId: 'ogrod' } });
    expect(rows[2]).toMatchObject({ type: 'game', game: { gameId: 'azul' } });
    expect(rows.some((row) => row.type === 'game' && row.game.gameId === 'azul-exp')).toBe(false);
    expect(rows.some((row) => row.type === 'header' && row.id === 'all')).toBe(true);
  });

  it('shows results only while searching', () => {
    const rows = buildPickerSections({
      games,
      recentIds: ['azul'],
      query: 'azu',
      locale: 'en',
    });
    expect(rows[0]).toEqual({ type: 'header', id: 'results' });
    expect(
      rows.every((row) => row.type === 'header' || row.game.title.toLowerCase().includes('azu')),
    ).toBe(true);
  });
});
