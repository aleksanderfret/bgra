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

/**
 * Shallow structural check on a decoded frame.
 *
 * Deliberately not a full schema validation: the goal is to keep a malformed
 * or unknown frame from reaching the UI as if it were a real event, while
 * staying forward-compatible with fields added later on the Python side.
 */
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
  /**
   * Feeds one network chunk in and returns every event that became complete.
   *
   * Chunk boundaries are arbitrary: a single frame can arrive split across
   * several calls, and several frames can arrive in one call. Bytes that do not
   * yet form a whole frame are retained until the next call.
   */
  push(chunk: string): AssistantEvent[];
  /** True when bytes are buffered, i.e. the stream ended mid-frame. */
  hasPendingBytes(): boolean;
}

/**
 * Incremental decoder for the `text/event-stream` framing used by `/ask`.
 *
 * Handles the parts of the SSE format that a naive `split('\n')` gets wrong:
 * multi-line `data:` fields (joined with a newline, per spec), `:` keep-alive
 * comments, both LF and CRLF line endings, and frames straddling chunks.
 */
export function createAssistantEventDecoder(): AssistantEventDecoder {
  let buffer = '';

  function decodeFrame(frame: string): AssistantEvent | null {
    const dataLines: string[] = [];

    for (const rawLine of frame.split('\n')) {
      // A line starting with ':' is a comment. Servers send these as
      // keep-alives to stop proxies from closing an idle stream.
      if (rawLine.length === 0 || rawLine.startsWith(':')) {
        continue;
      }
      const separatorIndex = rawLine.indexOf(':');
      const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
      if (field !== 'data') {
        // `event:`, `id:` and `retry:` carry no payload in this protocol; the
        // discriminator lives in the JSON body instead.
        continue;
      }
      let value = separatorIndex === -1 ? '' : rawLine.slice(separatorIndex + 1);
      // Exactly one leading space after the colon is part of the framing.
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('\n');
    // Tolerated for compatibility with plain-text SSE producers.
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
