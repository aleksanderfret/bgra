import en from '@bga-web-i18n/locales/en/common.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { PdfDropZone } from './PdfDropZone';

const readyHealth = { components: { retrieval_loading: false, reranker: true } };
const failedSearchHealth = { components: { retrieval_loading: false, reranker: false } };

interface StubFetchResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

interface StubXhrOptions {
  status: number;
  body: string;
  contentType: string;
  hang?: boolean;
}

const stubIngestXhr = (options: StubXhrOptions): void => {
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      upload = { onprogress: null };
      status = options.status;
      responseText = options.body;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(): void {}
      send(): void {
        if (options.hang) {
          return;
        }
        queueMicrotask(() => {
          this.onload?.();
        });
      }
      abort(): void {
        this.onabort?.();
      }
      getResponseHeader(name: string): string | null {
        return name.toLowerCase() === 'content-type' ? options.contentType : null;
      }
    },
  );
};

const stubEngineFetch = (
  handler: (url: string) => StubFetchResponse | null,
): ReturnType<typeof vi.fn> => {
  return vi.fn().mockImplementation(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes('/health')) {
      return { ok: true, json: async () => readyHealth };
    }
    if (url.includes('/games')) {
      return { ok: true, json: async () => [] };
    }
    const custom = handler(url);
    if (custom !== null) {
      return custom;
    }
    return { ok: true, json: async () => ({}) };
  });
};

describe('PdfDropZone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes fieldsets, mode helper, and a keyboard path to choose a file', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch(() => null),
    );

    render(<PdfDropZone />, 'en');

    expect(screen.getByRole('form', { name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.howAdding.legend })).toBeInTheDocument();
    expect(screen.getByText(en.pdfImport.howAdding.helper)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.newGame.legend })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.drop.legend })).toBeInTheDocument();

    const choose = await screen.findByRole('button', { name: en.pdfImport.drop.chooseFile });
    await waitFor(() => {
      expect(choose).toBeEnabled();
    });
    expect(choose).toHaveAttribute('type', 'button');
  });

  it('disables choosing a file when search never started', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/health')) {
          return { ok: true, json: async () => failedSearchHealth };
        }
        if (url.includes('/games')) {
          return { ok: true, json: async () => [] };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeDisabled();
    });
  });

  it('rejects an invalid game id before uploading and focuses the field', async () => {
    const fetchMock = stubEngineFetch(() => null);
    vi.stubGlobal('fetch', fetchMock);

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'Azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(
      fetchMock.mock.calls.every((call) => {
        const url = String(call[0]);
        return url.includes('/games') || url.includes('/health');
      }),
    ).toBe(true);
    expect(screen.getByText(en.pdfImport.error.invalidGameIdBody)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      ).toHaveFocus();
    });
  });

  it('shows sending activity while the upload is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch(() => null),
    );
    stubIngestXhr({
      status: 200,
      contentType: 'text/event-stream',
      body: '',
      hang: true,
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(await screen.findByText(en.activity.sending)).toBeInTheDocument();
  });

  it('uploads the PDF through the engine proxy and reports success as a status', async () => {
    const fetchMock = stubEngineFetch(() => null);
    vi.stubGlobal('fetch', fetchMock);
    stubIngestXhr({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'ingest_done', game: { gameId: 'azul' } })}\n\n`,
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      en.pdfImport.success.body.replace('{{gameId}}', 'azul'),
    );
  });

  it('announces a failed import as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch(() => null),
    );
    stubIngestXhr({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', code: 'ingest_failed', message: 'boom' }),
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(en.pdfImport.error.ingestFailedBody);
  });

  it('announces a busy engine as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch(() => null),
    );
    stubIngestXhr({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', code: 'ingest_busy', message: 'busy' }),
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(en.pdfImport.error.ingestBusyBody);
  });

  it('announces a search-index failure as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch(() => null),
    );
    stubIngestXhr({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', code: 'index_failed', message: 'embed down' }),
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(en.pdfImport.error.indexFailedBody);
    expect(
      screen.getByRole('button', { name: en.pdfImport.error.indexFailedRetry }),
    ).toBeInTheDocument();
  });

  it('retries search indexing from the alert without re-uploading the PDF', async () => {
    vi.stubGlobal(
      'fetch',
      stubEngineFetch((url) => {
        if (url.includes('/ingest/reindex')) {
          return { ok: true, json: async () => ({ ok: true, documentsIndexed: 1 }) };
        }
        return null;
      }),
    );
    stubIngestXhr({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', code: 'index_failed', message: 'embed down' }),
    });

    render(<PdfDropZone />, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.pdfImport.drop.chooseFile })).toBeEnabled();
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: en.pdfImport.error.indexFailedRetry }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      en.pdfImport.error.indexRetrySuccessBody,
    );
  });
});
