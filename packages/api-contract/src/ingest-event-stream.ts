import type { IngestEvent, IngestStage } from './types';

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(['ingest_progress', 'ingest_done', 'error']);

const INGEST_STAGES: ReadonlySet<string> = new Set([
  'saving',
  'reading',
  'drawing',
  'filing',
  'community',
  'indexing',
]);

const isIngestStage = (value: unknown): value is IngestStage => {
  return typeof value === 'string' && INGEST_STAGES.has(value);
};

export const isIngestEvent = (value: unknown): value is IngestEvent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('type' in value) || typeof value.type !== 'string' || !KNOWN_EVENT_TYPES.has(value.type)) {
    return false;
  }
  if (value.type === 'ingest_progress') {
    return (
      'stage' in value &&
      isIngestStage(value.stage) &&
      'percent' in value &&
      typeof value.percent === 'number'
    );
  }
  if (value.type === 'ingest_done') {
    return 'game' in value && typeof value.game === 'object' && value.game !== null;
  }
  return 'code' in value && typeof value.code === 'string' && 'message' in value;
};

export interface IngestEventDecoder {
  push(chunk: string): IngestEvent[];
  hasPendingBytes(): boolean;
}

export const createIngestEventDecoder = (): IngestEventDecoder => {
  let buffer = '';

  const decodeFrame = (frame: string): IngestEvent | null => {
    const dataLines: string[] = [];

    for (const rawLine of frame.split('\n')) {
      if (rawLine.length === 0 || rawLine.startsWith(':')) {
        continue;
      }
      const separatorIndex = rawLine.indexOf(':');
      const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
      if (field !== 'data') {
        continue;
      }
      let value = separatorIndex === -1 ? '' : rawLine.slice(separatorIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return {
        type: 'error',
        code: 'malformed_frame',
        message: 'Received a stream frame that is not valid JSON.',
      };
    }

    if (!isIngestEvent(parsed)) {
      return {
        type: 'error',
        code: 'unknown_event',
        message: 'Received a stream frame that does not match the event contract.',
      };
    }

    return parsed;
  };

  return {
    push(chunk: string): IngestEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const events: IngestEvent[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = decodeFrame(frame);
        if (event !== null) {
          events.push(event);
        }
        boundary = buffer.indexOf('\n\n');
      }
      return events;
    },
    hasPendingBytes(): boolean {
      return buffer.length > 0;
    },
  };
};
