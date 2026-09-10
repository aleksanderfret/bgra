import en from '@bga-web-i18n/locales/en/common.json';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { DesktopGate } from './DesktopGate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

describe('DesktopGate', () => {
  it('shows a wait state while the desktop probe is in flight', () => {
    window.bgaDesktop = {
      platform: 'darwin',
      getSetupState: () => new Promise(() => undefined),
      saveDiagnostics: async () => ({ path: '/tmp/d.json' }),
      markSetupComplete: async () => {
        throw new Error('unused');
      },
      ensureRuntime: async () => ({ ok: true as const }),
      onRuntimeProgress: () => () => undefined,
      openExternalHttps: async () => undefined,
      pullModels: async () => ({ ok: true as const }),
      getUninstallPreview: async () => ({
        platform: 'darwin' as const,
        defaults: {
          removeData: false,
          removeApplication: false,
          removeLlmModels: false,
          removeOllama: false,
        },
      }),
      runUninstall: async () => ({ steps: [], allSelectedOk: true }),
    };
    render(
      <DesktopGate locale="en">
        <p>gate-open</p>
      </DesktopGate>,
      'en',
    );
    expect(screen.getByRole('status')).toHaveTextContent(en.activity.starting_assistant);
    expect(screen.queryByText('gate-open')).not.toBeInTheDocument();
  });

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
