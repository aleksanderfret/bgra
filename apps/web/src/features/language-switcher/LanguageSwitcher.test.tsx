import { describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, userEvent } from '@/test-utils';
import { LanguageSwitcher } from './LanguageSwitcher';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/en/games/azul',
}));

describe('LanguageSwitcher', () => {
  it('navigates to the same page under the other locale', async () => {
    render(<LanguageSwitcher />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.language.pl }));

    // The URL is the only place the locale lives, so switching language has to
    // be a navigation; mutating i18next would leave the address bar lying.
    expect(replace).toHaveBeenCalledWith('/pl/games/azul');
  });

  it('marks the locale it was rendered with as the active one', () => {
    render(<LanguageSwitcher />, 'en');

    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();
  });
});
