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

const isEventStream = (xhr: XMLHttpRequest): boolean => {
  const contentType = xhr.getResponseHeader('content-type') ?? '';
  return contentType.includes('event-stream');
};

export const postIngestPdf = (
  form: FormData,
  handlers: IngestUploadHandlers,
): IngestUploadSession => {
  const xhr = new XMLHttpRequest();
  const decoder = createIngestEventDecoder();
  let seenChars = 0;
  let receivedEvents = 0;

  const consumeStreamDelta = (): void => {
    const text = xhr.responseText;
    if (text.length <= seenChars) {
      return;
    }
    const chunk = text.slice(seenChars);
    seenChars = text.length;
    for (const event of decoder.push(chunk)) {
      receivedEvents += 1;
      handlers.onEvent(event);
    }
  };

  const flushStreamTail = (): void => {
    consumeStreamDelta();
    if (!decoder.hasPendingBytes()) {
      return;
    }
    for (const event of decoder.push('\n\n')) {
      receivedEvents += 1;
      handlers.onEvent(event);
    }
  };

  xhr.open('POST', '/api/engine/ingest/pdf');
  xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
    if (event.lengthComputable && event.total > 0) {
      handlers.onUploadPercent(Math.round((100 * event.loaded) / event.total));
      return;
    }
    handlers.onUploadPercent(null);
  };
  xhr.onprogress = () => {
    if (xhr.readyState >= 2 && isEventStream(xhr)) {
      consumeStreamDelta();
    }
  };
  xhr.onabort = () => {
    handlers.onAbort?.();
  };
  xhr.onload = () => {
    if (isEventStream(xhr)) {
      flushStreamTail();
      if (receivedEvents === 0) {
        handlers.onEvent(errorEvent('ingest_failed', 'Ingest did not return a usable response.'));
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
