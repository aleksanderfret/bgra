import { LOCALE_STORAGE_KEY } from '@bga/utils/locale-prefs';
import en from '@bga-web-i18n/locales/en/common.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils';
import { LanguageSwitcher } from './LanguageSwitcher';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/en/games/azul',
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replace.mockClear();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ready: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the radiogroup with the visible translated label', () => {
    render(<LanguageSwitcher />, 'en');

    expect(screen.getByRole('radiogroup', { name: en.language.label })).toBeInTheDocument();
  });

  it('marks each language name with its own lang so AT pronounce it correctly', () => {
    render(<LanguageSwitcher />, 'en');

    expect(screen.getByText(en.language.pl)).toHaveAttribute('lang', 'pl');
    expect(screen.getByText(en.language.en)).toHaveAttribute('lang', 'en');
  });

  it('navigates to the same page under the other locale and remembers the choice', async () => {
    render(<LanguageSwitcher />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.language.pl }));

    // URL is the live locale; preference restores it on the next visit / launch.
    expect(replace).toHaveBeenCalledWith('/pl/games/azul');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl');
  });

  it('marks the locale it was rendered with as the active one', () => {
    render(<LanguageSwitcher />, 'en');

    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();
  });

  it('moves between options with the arrow keys', async () => {
    render(<LanguageSwitcher />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.language.en }));
    await userEvent.keyboard('{ArrowLeft}');

    expect(replace).toHaveBeenCalledWith('/pl/games/azul');
  });
});
