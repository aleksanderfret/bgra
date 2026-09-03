import type { AssistantEvent } from './types';

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'status',
  'transcript',
  'sources',
  'token',
  'figure',
  'audio',
  'notice',
  'done',
  'error',
]);

/** Shallow check: reject garbage, stay forward-compatible with extra fields. */
export function isAssistantEvent(value: unknown): value is AssistantEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type: unknown = (value as { type?: unknown }).type;
  if (typeof type !== 'string' || !KNOWN_EVENT_TYPES.has(type)) {
    return false;
  }
  if (type === 'token' || type === 'transcript') {
    return typeof (value as { text?: unknown }).text === 'string';
  }
  if (type === 'sources') {
    return Array.isArray((value as { sources?: unknown }).sources);
  }
  if (type === 'figure') {
    return typeof (value as { sourceId?: unknown }).sourceId === 'string';
  }
  return true;
}

export interface AssistantEventDecoder {
  push(chunk: string): AssistantEvent[];
  hasPendingBytes(): boolean;
}

/**
 * Incremental SSE decoder. A naive `split('\n')` drops keep-alives, multi-line
 * `data:` fields, CRLF, and frames that straddle chunks.
 */
export function createAssistantEventDecoder(): AssistantEventDecoder {
  let buffer = '';

  function decodeFrame(frame: string): AssistantEvent | null {
    const dataLines: string[] = [];

    for (const rawLine of frame.split('\n')) {
      // `:` lines are keep-alives so idle proxies do not close the stream.
      if (rawLine.length === 0 || rawLine.startsWith(':')) {
        continue;
      }
      const separatorIndex = rawLine.indexOf(':');
      const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
      if (field !== 'data') {
        // `event:` / `id:` / `retry:` are unused; the discriminator is in JSON.
        continue;
      }
      let value = separatorIndex === -1 ? '' : rawLine.slice(separatorIndex + 1);
      // Spec: one leading space after the colon is framing, not payload.
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('\n');
    // Some SSE producers send this sentinel; it is not one of our events.
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

    if (!isAssistantEvent(parsed)) {
      return {
        type: 'error',
        code: 'unknown_event',
        message: 'Received a stream frame that does not match the event contract.',
      };
    }

    return parsed;
  }

  return {
    push(chunk: string): AssistantEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      const events: AssistantEvent[] = [];
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
}
