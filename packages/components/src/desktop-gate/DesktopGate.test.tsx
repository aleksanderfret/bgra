import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { DesktopGate } from './DesktopGate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

describe('DesktopGate', () => {
  it('shows children when the desktop bridge is absent', async () => {
    Reflect.deleteProperty(window, 'bgaDesktop');
    render(
      <DesktopGate locale="en">
        <p>gate-open</p>
      </DesktopGate>,
      'en',
    );

    expect(await screen.findByText('gate-open')).toBeInTheDocument();
  });
});
