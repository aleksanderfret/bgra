import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, userEvent, waitFor } from '@/test-utils';
import { PdfDropZone } from './PdfDropZone';

describe('PdfDropZone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes fieldsets, mode helper, and a keyboard path to choose a file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );

    render(<PdfDropZone />, 'en');

    expect(screen.getByRole('form', { name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.howAdding.legend })).toBeInTheDocument();
    expect(screen.getByText(en.pdfImport.howAdding.helper)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.newGame.legend })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.drop.legend })).toBeInTheDocument();

    const choose = screen.getByRole('button', { name: en.pdfImport.drop.chooseFile });
    expect(choose).toHaveAttribute('type', 'button');
  });

  it('rejects an invalid game id before uploading and focuses the field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PdfDropZone />, 'en');

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

  it('uploads the PDF through the engine proxy and reports success as a status', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/games')) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => ({ gameId: 'azul', title: 'Azul', chunkCount: 2 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PdfDropZone />, 'en');

    await userEvent.type(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      'azul',
    );

    const file = new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      screen.getByLabelText(en.pdfImport.drop.chooseFile, { selector: 'input' }),
      file,
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/ingest/pdf'))).toBe(
        true,
      );
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      en.pdfImport.success.body.replace('{{gameId}}', 'azul'),
    );
  });

  it('announces a failed import as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        if (String(input).includes('/games')) {
          return { ok: true, json: async () => [] };
        }
        return {
          ok: false,
          json: async () => ({ type: 'error', code: 'ingest_failed', message: 'boom' }),
        };
      }),
    );

    render(<PdfDropZone />, 'en');

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
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        if (String(input).includes('/games')) {
          return { ok: true, json: async () => [] };
        }
        return {
          ok: false,
          json: async () => ({ type: 'error', code: 'ingest_busy', message: 'busy' }),
        };
      }),
    );

    render(<PdfDropZone />, 'en');

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
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        if (String(input).includes('/games')) {
          return { ok: true, json: async () => [] };
        }
        return {
          ok: false,
          json: async () => ({ type: 'error', code: 'index_failed', message: 'embed down' }),
        };
      }),
    );

    render(<PdfDropZone />, 'en');

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
  });
});
