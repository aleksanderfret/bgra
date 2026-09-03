import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, userEvent, waitFor } from '@/test-utils';
import { PdfDropZone } from './PdfDropZone';

describe('PdfDropZone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes a form, headings, and a keyboard path to choose a file', async () => {
    render(<PdfDropZone />, 'en');

    expect(screen.getByRole('form', { name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.pdfImport.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: en.pdfImport.drop.title })).toBeInTheDocument();

    const choose = screen.getByRole('button', { name: en.pdfImport.drop.chooseFile });
    expect(choose).toHaveAttribute('type', 'button');

    await userEvent.click(
      screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
    );
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(choose).toHaveFocus();
  });

  it('rejects an invalid game id before uploading and focuses the field', async () => {
    const fetchMock = vi.fn();
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

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(en.pdfImport.error.invalidGameIdBody)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: new RegExp(en.pdfImport.gameId.label) }),
      ).toHaveFocus();
    });
  });

  it('uploads the PDF through the engine proxy and reports success as a status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ gameId: 'azul', title: 'Azul', chunkCount: 2 }),
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      en.pdfImport.success.body.replace('{{gameId}}', 'azul'),
    );
  });

  it('announces a failed import as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ type: 'error', code: 'ingest_failed', message: 'boom' }),
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
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ type: 'error', code: 'ingest_busy', message: 'busy' }),
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
});
