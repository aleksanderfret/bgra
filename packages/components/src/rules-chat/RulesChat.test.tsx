import en from '@bga-web-i18n/locales/en/common.json';
import pl from '@bga-web-i18n/locales/pl/common.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { RulesChat } from './RulesChat';

const withEngineOffline = (): void => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const libraryGames = [
  {
    gameId: 'azul',
    title: 'Azul',
    chunkCount: 1,
    documentKinds: ['rulebook'] as const,
    indexedAt: '2026-01-01T00:00:00Z',
    baseGameId: null,
    documents: [],
  },
  {
    gameId: 'azul-crystal',
    title: 'Crystal Mosaic',
    chunkCount: 1,
    documentKinds: ['rulebook'] as const,
    indexedAt: '2026-02-01T00:00:00Z',
    baseGameId: 'azul',
    documents: [],
  },
  {
    gameId: 'brass',
    title: 'Brass',
    chunkCount: 1,
    documentKinds: ['rulebook'] as const,
    indexedAt: '2026-03-01T00:00:00Z',
    baseGameId: null,
    documents: [],
  },
];

const sseAsk = (token: string, answerId: string): Response =>
  new Response(
    `data: {"type":"sources","sources":[]}\n\ndata: {"type":"token","text":${JSON.stringify(token)}}\n\ndata: {"type":"done","answerId":${JSON.stringify(answerId)},"groundedness":"grounded"}\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

const readyLibraryFetch = (askBodies: string[]) => {
  let askIndex = 0;
  return vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/health')) {
      return {
        ok: true,
        json: async () => ({ components: { retrieval_loading: false, reranker: true } }),
      };
    }
    if (url.includes('/games')) {
      return {
        ok: true,
        json: async () => libraryGames,
      };
    }
    if (url.includes('/ask')) {
      const token = askBodies[askIndex] ?? 'Missing ruling.';
      askIndex += 1;
      return sseAsk(token, String(askIndex));
    }
    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const askBodiesOf = (fetchMock: ReturnType<typeof vi.fn>): unknown[] => {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).includes('/ask'))
    .map((call) => {
      const init = call[1];
      const rawBody =
        typeof init === 'object' && init !== null && 'body' in init ? init.body : undefined;
      return JSON.parse(String(rawBody));
    });
};

describe('RulesChat', () => {
  it('does not tell a player to run a terminal command when the engine is still starting', async () => {
    withEngineOffline();

    render(<RulesChat />);

    expect(await screen.findByRole('form', { name: pl.rulesChat.formLabel })).toBeInTheDocument();
    expect(screen.queryByText(/pnpm/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('labels every control in the requested language', async () => {
    withEngineOffline();

    render(<RulesChat />, 'en');

    await waitFor(() => {
      expect(screen.getByLabelText(en.rulesChat.question.label)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: en.rulesChat.submit })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.rulesChat.game.label })).toBeInTheDocument();
    expect(screen.getByText(en.rulesChat.game.description)).toBeInTheDocument();
  });

  it('lists only base games and sends expansionIds when an expansion is ticked', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ components: { retrieval_loading: false, reranker: true } }),
        };
      }
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
      interface AskBody {
        gameId: string;
        expansionIds?: string[];
      }
      const isAskBody = (value: unknown): value is AskBody => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return false;
        }
        if (!('gameId' in value) || typeof value.gameId !== 'string') {
          return false;
        }
        if ('expansionIds' in value && value.expansionIds !== undefined) {
          return (
            Array.isArray(value.expansionIds) &&
            value.expansionIds.every((id) => typeof id === 'string')
          );
        }
        return true;
      };
      const init = askCall[1];
      const rawBody =
        typeof init === 'object' && init !== null && 'body' in init ? init.body : undefined;
      const parsed: unknown = JSON.parse(String(rawBody));
      expect(isAskBody(parsed)).toBe(true);
      if (!isAskBody(parsed)) {
        return;
      }
      expect(parsed.gameId).toBe('azul');
      expect(parsed.expansionIds).toEqual(['azul-crystal']);
    });
  });

  it('keeps Ask disabled when search never started', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/health')) {
          return {
            ok: true,
            json: async () => ({ components: { retrieval_loading: false, reranker: false } }),
          };
        }
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
            ],
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<RulesChat />, 'en');

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));
    await userEvent.type(
      screen.getByLabelText(en.rulesChat.question.label),
      'How many tiles do I draw?',
    );

    expect(screen.getByRole('button', { name: en.rulesChat.submit })).toBeDisabled();
  });

  it('leaves the first answer on screen after a second question', async () => {
    vi.stubGlobal('fetch', readyLibraryFetch(['First ruling.', 'Second ruling.']));

    render(<RulesChat />, 'en');

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));
    await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), 'How do I score?');
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));

    expect(await screen.findByText('First ruling.')).toBeInTheDocument();
    expect(screen.getByText('How do I score?')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), 'When does it end?');
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));

    expect(await screen.findByText('Second ruling.')).toBeInTheDocument();
    expect(screen.getByText('First ruling.')).toBeInTheDocument();
    expect(screen.getByText('How do I score?')).toBeInTheDocument();
    expect(screen.getByText('When does it end?')).toBeInTheDocument();
    expect(screen.getAllByText('First ruling.')).toHaveLength(1);
    expect(screen.getAllByText('Second ruling.')).toHaveLength(1);
  });

  it('reloads the Azul thread after visiting another game', async () => {
    vi.stubGlobal('fetch', readyLibraryFetch(['Azul answer.']));

    render(<RulesChat />, 'en');

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));
    await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), 'How do I score?');
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));

    expect(await screen.findByText('Azul answer.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Brass' }));

    expect(screen.queryByText('Azul answer.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));

    expect(await screen.findByText('Azul answer.')).toBeInTheDocument();
  });

  it('posts a question-only Ask body with arbitrate mode and no prior turns', async () => {
    const fetchMock = readyLibraryFetch(['First ruling.', 'Second ruling.']);
    vi.stubGlobal('fetch', fetchMock);

    render(<RulesChat />, 'en');

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));
    await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), 'How do I score?');
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));
    expect(await screen.findByText('First ruling.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), 'When does it end?');
    await userEvent.click(screen.getByRole('button', { name: en.rulesChat.submit }));
    expect(await screen.findByText('Second ruling.')).toBeInTheDocument();

    const bodies = askBodiesOf(fetchMock);
    expect(bodies).toHaveLength(2);
    const second = bodies[1];
    expect(isRecord(second)).toBe(true);
    if (!isRecord(second)) {
      return;
    }
    expect(Object.keys(second).every((key) => ASK_BODY_KEYS.has(key))).toBe(true);
    expect(second).not.toHaveProperty('messages');
    expect(second).not.toHaveProperty('thread');
    expect(second).not.toHaveProperty('history');
    expect(second.question).toBe('When does it end?');
    expect(second.mode).toBe('arbitrate');
  });
});

const ASK_BODY_KEYS = new Set(['gameId', 'question', 'mode', 'expansionIds', 'sessionId']);
