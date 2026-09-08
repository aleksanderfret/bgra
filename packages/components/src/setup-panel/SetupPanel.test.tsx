import en from '@bga-web-i18n/locales/en/common.json';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test-utils';
import { SetupPanel } from './SetupPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('SetupPanel', () => {
  it('shows the browser-only notice when the desktop bridge is absent', () => {
    Reflect.deleteProperty(window, 'bgaDesktop');
    render(<SetupPanel />, 'en');
    expect(screen.getByText(en.setup.browserOnly.title)).toBeInTheDocument();
  });
});
