import { afterEach, describe, expect, it, vi } from 'vitest';
import { postIngestPdf } from './ingest-upload';

interface UploadProgressLike {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

interface StubXhr {
  upload: { onprogress: ((event: UploadProgressLike) => void) | null };
  status: number;
  readyState: number;
  responseText: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  onprogress: (() => void) | null;
  open: () => void;
  send: () => void;
  abort: () => void;
  getResponseHeader: (name: string) => string | null;
}

const installXhr = (options: {
  status?: number;
  responseText?: string;
  contentType?: string | null;
}): { getInstance: () => StubXhr } => {
  let instance: StubXhr | null = null;
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      static HEADERS_RECEIVED = 2;
      static LOADING = 3;
      static DONE = 4;
      upload: StubXhr['upload'] = { onprogress: null };
      status = options.status ?? 200;
      readyState = 1;
      responseText = options.responseText ?? '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onprogress: (() => void) | null = null;
      open(): void {}
      send(): void {}
      abort(): void {
        this.onabort?.();
      }
      getResponseHeader(name: string): string | null {
        return name.toLowerCase() === 'content-type' ? (options.contentType ?? null) : null;
      }
      constructor() {
        instance = this;
      }
    },
  );
  return {
    getInstance: () => {
      if (instance === null) {
        throw new Error('XMLHttpRequest was not constructed');
      }
      return instance;
    },
  };
};

describe('postIngestPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports upload percent and parses a streamed done event', () => {
    const xhr = installXhr({
      responseText: `data: ${JSON.stringify({ type: 'ingest_done', game: { gameId: 'azul' } })}\n\n`,
      contentType: 'text/event-stream',
    });

    const percents: Array<number | null> = [];
    const events: string[] = [];
    postIngestPdf(new FormData(), {
      onUploadPercent: (percent) => {
        percents.push(percent);
      },
      onEvent: (event) => {
        events.push(event.type);
      },
    });
    const created = xhr.getInstance();
    created.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 80 });
    created.readyState = 4;
    created.onload?.();

    expect(percents).toEqual([50]);
    expect(events).toEqual(['ingest_done']);
  });

  it('delivers mid-stream ingest_progress before the request finishes', () => {
    const progressFrame = `data: ${JSON.stringify({
      type: 'ingest_progress',
      stage: 'reading',
      current: 2,
      total: 10,
      percent: 34,
    })}\n\n`;
    const doneFrame = `data: ${JSON.stringify({ type: 'ingest_done', game: { gameId: 'azul' } })}\n\n`;
    const xhr = installXhr({
      responseText: '',
      contentType: 'text/event-stream',
    });

    const events: Array<{ type: string; stage?: string; percent?: number }> = [];
    postIngestPdf(new FormData(), {
      onUploadPercent: () => undefined,
      onEvent: (event) => {
        events.push(event);
      },
    });
    const created = xhr.getInstance();
    created.readyState = 3;
    created.responseText = progressFrame;
    created.onprogress?.();
    expect(events).toEqual([
      {
        type: 'ingest_progress',
        stage: 'reading',
        current: 2,
        total: 10,
        percent: 34,
      },
    ]);

    created.responseText = progressFrame + doneFrame;
    created.onprogress?.();
    created.readyState = 4;
    created.onload?.();
    expect(events.map((event) => event.type)).toEqual(['ingest_progress', 'ingest_done']);
  });

  it('reads a JSON error when the response is not a stream', () => {
    const xhr = installXhr({
      status: 409,
      responseText: JSON.stringify({ type: 'error', code: 'ingest_busy', message: 'busy' }),
      contentType: 'application/json',
    });

    const events: Array<{ type: string; code?: string }> = [];
    postIngestPdf(new FormData(), {
      onUploadPercent: () => undefined,
      onEvent: (event) => {
        events.push(event);
      },
    });
    xhr.getInstance().onload?.();

    expect(events).toEqual([{ type: 'error', code: 'ingest_busy', message: 'busy' }]);
  });

  it('notifies abort so the drop zone can return to idle', () => {
    const xhr = installXhr({});

    let aborted = false;
    const session = postIngestPdf(new FormData(), {
      onUploadPercent: () => undefined,
      onEvent: () => undefined,
      onAbort: () => {
        aborted = true;
      },
    });
    expect(xhr.getInstance()).toBeDefined();
    session.abort();
    expect(aborted).toBe(true);
  });
});
