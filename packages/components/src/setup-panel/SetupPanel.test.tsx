import type { DesktopSetupState } from '@bga/utils/desktop-bridge';
import en from '@bga-web-i18n/locales/en/common.json';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test-utils';
import { isReturningSetupPlayer, SetupPanel, shouldAutoResumeSetup } from './SetupPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const firstOpenState: DesktopSetupState = {
  machine: null,
  recommendation: null,
  ollamaPath: null,
  ollamaDownloadUrl: 'https://ollama.com/download',
  uvPath: null,
  setupComplete: false,
  askReady: false,
  gatePassed: false,
  runtimeBusy: false,
  missingModels: [],
  healthModels: { llm: '', embedding: '' },
};

describe('isReturningSetupPlayer / shouldAutoResumeSetup', () => {
  it('does not treat a true first open as returning', () => {
    expect(isReturningSetupPlayer(firstOpenState)).toBe(false);
    expect(shouldAutoResumeSetup(firstOpenState)).toBe(false);
  });

  it('treats finished setup, Ollama on PATH, or a busy runtime as returning', () => {
    expect(isReturningSetupPlayer({ ...firstOpenState, setupComplete: true })).toBe(true);
    expect(isReturningSetupPlayer({ ...firstOpenState, ollamaPath: '/usr/bin/ollama' })).toBe(true);
    expect(isReturningSetupPlayer({ ...firstOpenState, runtimeBusy: true })).toBe(true);
    expect(shouldAutoResumeSetup({ ...firstOpenState, askReady: true, setupComplete: true })).toBe(
      true,
    );
  });
});

describe('SetupPanel', () => {
  it('shows the browser-only notice when the desktop bridge is absent', () => {
    Reflect.deleteProperty(window, 'bgaDesktop');
    render(<SetupPanel />, 'en');
    expect(screen.getByText(en.setup.browserOnly.title)).toBeInTheDocument();
  });

  it('does not ask a returning player to tap Install again', async () => {
    window.bgaDesktop = {
      platform: 'darwin',
      getSetupState: async () => ({ ...firstOpenState, setupComplete: true, runtimeBusy: true }),
      saveDiagnostics: async () => ({ path: '/tmp/d.json' }),
      markSetupComplete: async () => ({ ...firstOpenState, setupComplete: true, askReady: true }),
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
    render(<SetupPanel />, 'en');
    expect(await screen.findByRole('status')).toHaveTextContent(en.activity.preparing_search);
    expect(
      screen.queryByRole('button', { name: en.setup.runtime.primaryAction }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(en.setup.title)).not.toBeInTheDocument();
  });

  it('keeps the wait view when a returning player is already Ask-ready', async () => {
    const markSetupComplete = vi.fn(async () => ({
      ...firstOpenState,
      setupComplete: true,
      askReady: true,
      gatePassed: true,
    }));
    window.bgaDesktop = {
      platform: 'darwin',
      getSetupState: async () => ({
        ...firstOpenState,
        setupComplete: true,
        askReady: true,
        gatePassed: true,
      }),
      saveDiagnostics: async () => ({ path: '/tmp/d.json' }),
      markSetupComplete,
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
    render(<SetupPanel />, 'en');
    expect(await screen.findByRole('status')).toHaveTextContent(en.activity.preparing_search);
    expect(screen.queryByText(en.setup.hardware.title)).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(markSetupComplete).toHaveBeenCalled();
    });
  });
});
