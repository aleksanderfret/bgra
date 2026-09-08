import { createIngestEventDecoder, type IngestEvent, isIngestEvent } from '@bga/api-contract';

export interface IngestUploadHandlers {
  onUploadPercent: (percent: number | null) => void;
  onEvent: (event: IngestEvent) => void;
  onAbort?: () => void;
}

export interface IngestUploadSession {
  abort: () => void;
}

const errorEvent = (code: string, message: string): IngestEvent => {
  return { type: 'error', code, message };
};

export const postIngestPdf = (
  form: FormData,
  handlers: IngestUploadHandlers,
): IngestUploadSession => {
  const xhr = new XMLHttpRequest();
  const decoder = createIngestEventDecoder();

  xhr.open('POST', '/api/engine/ingest/pdf');
  xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
    if (event.lengthComputable && event.total > 0) {
      handlers.onUploadPercent(Math.round((100 * event.loaded) / event.total));
      return;
    }
    handlers.onUploadPercent(null);
  };
  xhr.onabort = () => {
    handlers.onAbort?.();
  };
  xhr.onload = () => {
    const contentType = xhr.getResponseHeader('content-type') ?? '';
    if (contentType.includes('event-stream')) {
      const events = decoder.push(`${xhr.responseText}\n\n`);
      if (events.length === 0) {
        handlers.onEvent(errorEvent('ingest_failed', 'Ingest did not return a usable response.'));
        return;
      }
      for (const event of events) {
        handlers.onEvent(event);
      }
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(xhr.responseText) as unknown;
    } catch {
      parsed = null;
    }
    if (isIngestEvent(parsed) && parsed.type === 'error') {
      handlers.onEvent(parsed);
      return;
    }
    handlers.onEvent(
      errorEvent(
        xhr.status === 502 ? 'engine_unreachable' : 'ingest_failed',
        'Ingest did not return a usable response.',
      ),
    );
  };
  xhr.onerror = () => {
    handlers.onEvent(
      errorEvent('engine_unreachable', 'The ingest request failed to reach the engine.'),
    );
  };
  xhr.send(form);
  return {
    abort: () => {
      xhr.abort();
    },
  };
};
