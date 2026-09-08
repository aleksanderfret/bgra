import en from '@bga-web-i18n/locales/en/common.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { AssistantReadyGate } from './AssistantReadyGate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssistantReadyGate', () => {
  it('holds the assistant until search is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ components: { retrieval_loading: true, reranker: false } }),
      }),
    );

    render(
      <AssistantReadyGate>
        <p>assistant-open</p>
      </AssistantReadyGate>,
      'en',
    );

    expect(await screen.findByRole('status')).toHaveTextContent(en.activity.preparing_search);
    expect(screen.queryByText('assistant-open')).not.toBeInTheDocument();
  });

  it('lets recovery UI through when search never started', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ components: { retrieval_loading: false, reranker: false } }),
      }),
    );

    render(
      <AssistantReadyGate>
        <p>assistant-open</p>
      </AssistantReadyGate>,
      'en',
    );

    expect(await screen.findByText('assistant-open')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reveals children once search is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ components: { retrieval_loading: false, reranker: true } }),
      }),
    );

    render(
      <AssistantReadyGate>
        <p>assistant-open</p>
      </AssistantReadyGate>,
      'en',
    );

    expect(await screen.findByText('assistant-open')).toBeInTheDocument();
  });
});
