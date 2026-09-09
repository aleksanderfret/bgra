import en from '@bga-web-i18n/locales/en/common.json';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { UninstallPanel } from './UninstallPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/en/uninstall',
}));

describe('UninstallPanel', () => {
  it('shows desktop-only copy in the browser', () => {
    render(<UninstallPanel />, 'en');
    expect(screen.getByText(en.uninstall.desktopOnly.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.uninstall.desktopOnly.back })).toBeInTheDocument();
  });
});
