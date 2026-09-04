import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, waitFor } from '@/test-utils';
import { EngineReadinessBanner } from './EngineReadinessBanner';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EngineReadinessBanner', () => {
  it('says the assistant is preparing while search is still loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ components: { retrieval_loading: true } }),
      }),
    );

    render(<EngineReadinessBanner />, 'en');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(en.engineReadiness.starting.title);
    expect(status).toHaveTextContent(en.engineReadiness.starting.body);
    expect(screen.queryByText(/pnpm/)).not.toBeInTheDocument();
  });

  it('says the assistant is preparing when the engine is not reachable yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));

    render(<EngineReadinessBanner />, 'en');

    expect(await screen.findByRole('status')).toHaveTextContent(en.engineReadiness.starting.title);
  });

  it('hides once health reports that loading has finished', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ components: { retrieval_loading: false, reranker: true } }),
      }),
    );

    render(<EngineReadinessBanner />, 'en');

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
