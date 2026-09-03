import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import pl from '@/i18n/locales/pl/common.json';
import { render, screen, userEvent, waitFor, within } from '@/test-utils';
import { RulesChat } from './RulesChat';

function withEngineOffline(): void {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RulesChat', () => {
  it('explains how to start the engine when it is unreachable', async () => {
    withEngineOffline();

    render(<RulesChat />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(pl.rulesChat.engineOffline.title);
  });

  it('renders the command in the offline alert as markup, not as literal tags', async () => {
    withEngineOffline();

    render(<RulesChat />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('pnpm dev')).toBeInTheDocument();
    expect(screen.queryByText(/<command>/)).not.toBeInTheDocument();
  });

  it('labels every control in the requested language', async () => {
    withEngineOffline();

    render(<RulesChat />, 'en');

    await waitFor(() => {
      expect(screen.getByLabelText(en.rulesChat.question.label)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: en.rulesChat.submit })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.rulesChat.game.label })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.rulesChat.mode.legend })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.rulesChat.mode.teach })).toBeInTheDocument();
    expect(screen.getByText(en.rulesChat.game.description)).toBeInTheDocument();
  });

  it('lists only base games and sends expansionIds when an expansion is ticked', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/games')) {
        return {
          ok: true,
          json: async () => [
            {
              gameId: 'azul',
              title: 'Azul',
              chunkCount: 1,
              documentKinds: ['rulebook'],
              indexedAt: '2026-01-01T00:00:00Z',
              baseGameId: null,
              documents: [],
            },
            {
              gameId: 'azul-crystal',
              title: 'Crystal Mosaic',
              chunkCount: 1,
              documentKinds: ['rulebook'],
              indexedAt: '2026-02-01T00:00:00Z',
              baseGameId: 'azul',
              documents: [],
            },
            {
              gameId: 'brass',
              title: 'Brass',
              chunkCount: 1,
              documentKinds: ['rulebook'],
              indexedAt: '2026-03-01T00:00:00Z',
              baseGameId: null,
              documents: [],
            },
          ],
        };
      }
      if (url.includes('/ask')) {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"sources","sources":[]}\n\ndata: {"type":"done","answerId":"1","groundedness":"partial"}\n\n',
                ),
              );
              controller.close();
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RulesChat />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('group', { name: en.rulesChat.game.label })).toBeInTheDocument();
    });

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));

    expect(screen.getByRole('group', { name: en.rulesChat.expansions.legend })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Crystal Mosaic' }));

    await userEvent.type(
      screen.getByLabelText(en.rulesChat.question.label),
      'How does scoring work?',
    );
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));

    await waitFor(() => {
      const askCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/ask'));
      expect(askCall).toBeDefined();
      if (askCall === undefined) {
        throw new Error('expected /ask fetch');
      }
      const init = askCall[1] as RequestInit;
      const body = JSON.parse(String(init.body)) as {
        gameId: string;
        expansionIds?: string[];
      };
      expect(body.gameId).toBe('azul');
      expect(body.expansionIds).toEqual(['azul-crystal']);
    });
  });
});
