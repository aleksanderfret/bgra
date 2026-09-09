import { THREAD_STORAGE_PREFIX } from '@bga/utils/conversation-thread';
import en from '@bga-web-i18n/locales/en/common.json';
import pl from '@bga-web-i18n/locales/pl/common.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { LessonPanel } from './LessonPanel';

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
];

const readyFetch = (): ReturnType<typeof vi.fn> =>
  vi.fn().mockImplementation(async (input: RequestInfo) => {
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
    if (url.includes('/lesson/active')) {
      return {
        ok: true,
        json: async () => ({ session: null }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

describe('LessonPanel', () => {
  it('renders start and does not write a rules thread', async () => {
    const fetchMock = readyFetch();
    vi.stubGlobal('fetch', fetchMock);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<LessonPanel />, 'en');

    expect(await screen.findByRole('button', { name: en.teach.start })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.rulesChat.game.label })).toBeInTheDocument();

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/lesson/active'))).toBe(
        true,
      );
    });

    expect(
      setItem.mock.calls.some((call) => String(call[0]).startsWith(THREAD_STORAGE_PREFIX)),
    ).toBe(false);
  });

  it('labels controls in Polish', async () => {
    vi.stubGlobal('fetch', readyFetch());

    render(<LessonPanel />, 'pl');

    expect(await screen.findByRole('button', { name: pl.teach.start })).toBeInTheDocument();
  });

  it('keeps a blocking notice visible after the stream ends', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ components: { retrieval_loading: false, reranker: true } }),
        };
      }
      if (url.includes('/games')) {
        return { ok: true, json: async () => libraryGames };
      }
      if (url.includes('/lesson/active')) {
        return { ok: true, json: async () => ({ session: null }) };
      }
      if (url.includes('/lesson/start') && init?.method === 'POST') {
        const body = [
          'data: {"type":"notice","code":"lesson_plan_failed","params":{}}\n\n',
          'data: {"type":"sources","sources":[]}\n\n',
          'data: {"type":"done","answerId":"x","groundedness":"insufficient_evidence"}\n\n',
        ].join('');
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body));
              controller.close();
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LessonPanel />, 'en');

    const gameCombobox = await screen.findByRole('combobox');
    await userEvent.click(gameCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Azul' }));

    await userEvent.click(await screen.findByRole('button', { name: en.teach.start }));

    expect(await screen.findByText(en.notice.lesson_plan_failed)).toBeInTheDocument();
  });
});
