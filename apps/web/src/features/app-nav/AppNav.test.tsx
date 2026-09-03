import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, userEvent } from '@/test-utils';
import { AppNav } from './AppNav';

const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useRouter: () => ({ replace, push }),
}));

describe('AppNav', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
  });

  it('names the main views control and highlights the assistant', () => {
    render(<AppNav />, 'en');

    expect(screen.getByRole('navigation', { name: en.appNav.label })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.appNav.assistant })).toBeChecked();
    expect(screen.getByRole('radio', { name: en.appNav.rulebooks })).not.toBeChecked();
  });

  it('opens the rulebooks view when the user picks it', async () => {
    render(<AppNav />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.appNav.rulebooks }));

    expect(push).toHaveBeenCalledWith('/en/rulebooks');
  });
});
