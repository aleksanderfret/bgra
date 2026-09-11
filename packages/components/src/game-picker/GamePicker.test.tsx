import en from '@bga-web-i18n/locales/en/common.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils';
import { GamePicker } from './GamePicker';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const catalogue = [
  { gameId: 'azul', title: 'Azul', baseGameId: null },
  { gameId: 'brass', title: 'Brass', baseGameId: null },
  { gameId: 'azul-exp', title: 'Azul Expansion', baseGameId: 'azul' },
];

describe('GamePicker', () => {
  it('lists recent and all sections, and records a selection', async () => {
    localStorage.setItem('bga.games.recent.v1', JSON.stringify(['brass']));
    render(
      <GamePicker
        value={null}
        onChange={vi.fn()}
        locale="en"
        games={catalogue}
        basesOnly
        placeholder={en.gamePicker.placeholder}
      />,
      'en',
    );

    const combobox = await screen.findByRole('combobox');
    await userEvent.click(combobox);
    expect(await screen.findByText(en.gamePicker.recent)).toBeInTheDocument();
    expect(screen.getByText(en.gamePicker.all)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));
    expect(JSON.parse(localStorage.getItem('bga.games.recent.v1') ?? '[]')[0]).toBe('azul');
  });

  it('shows results only while searching', async () => {
    render(
      <GamePicker value={null} onChange={vi.fn()} locale="en" games={catalogue} basesOnly />,
      'en',
    );
    const combobox = await screen.findByRole('combobox');
    await userEvent.click(combobox);
    await userEvent.type(combobox, 'azu');
    expect(await screen.findByText(en.gamePicker.results)).toBeInTheDocument();
    expect(screen.queryByText(en.gamePicker.recent)).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Azul' })).toBeInTheDocument();
  });
});
