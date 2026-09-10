import en from '@bga-web-i18n/locales/en/common.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '../test-utils';
import { AppNav } from './AppNav';

const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/check-rule',
  useRouter: () => ({ replace, push }),
}));

describe('AppNav', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
  });

  it('names the main views control and highlights check-rule on that page', () => {
    render(<AppNav />, 'en');

    expect(screen.getByRole('navigation', { name: en.appNav.label })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.appNav.checkRule })).toBeChecked();
    expect(screen.getByRole('radio', { name: en.appNav.learn })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: en.appNav.addGame })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: en.appNav.settings })).not.toBeChecked();
  });

  it('opens the learn view when the user picks it', async () => {
    render(<AppNav />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.appNav.learn }));

    expect(push).toHaveBeenCalledWith('/en/learn');
  });

  it('opens the add-game view when the user picks it', async () => {
    render(<AppNav />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.appNav.addGame }));

    expect(push).toHaveBeenCalledWith('/en/add-game');
  });

  it('opens settings when the user picks it', async () => {
    render(<AppNav />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.appNav.settings }));

    expect(push).toHaveBeenCalledWith('/en/settings');
  });
});
