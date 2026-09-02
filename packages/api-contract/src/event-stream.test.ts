import { describe, expect, it } from 'vitest';
import { createAssistantEventDecoder } from './event-stream';

const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

describe('createAssistantEventDecoder', () => {
  it('decodes a complete frame', () => {
    const decoder = createAssistantEventDecoder();

    expect(decoder.push(frame({ type: 'token', text: 'Dociągasz ' }))).toEqual([
      { type: 'token', text: 'Dociągasz ' },
    ]);
  });

  it('reassembles a frame split across chunks', () => {
    const decoder = createAssistantEventDecoder();
    const whole = frame({ type: 'token', text: 'trzy karty' });
    const splitAt = 12;

    expect(decoder.push(whole.slice(0, splitAt))).toEqual([]);
    expect(decoder.push(whole.slice(splitAt))).toEqual([{ type: 'token', text: 'trzy karty' }]);
  });

  it('decodes several frames arriving in one chunk', () => {
    const decoder = createAssistantEventDecoder();
    const chunk =
      frame({ type: 'status', stage: 'generating' }) +
      frame({ type: 'token', text: 'a' }) +
      frame({ type: 'done', answerId: 'a-1', groundedness: 'grounded' });

    expect(decoder.push(chunk)).toHaveLength(3);
  });

  it('joins multi-line data fields with newlines, per the SSE spec', () => {
    const decoder = createAssistantEventDecoder();
    // A JSON payload containing a newline is emitted as consecutive data lines.
    const chunk = 'data: {"type":"token",\ndata: "text":"line"}\n\n';

    expect(decoder.push(chunk)).toEqual([{ type: 'token', text: 'line' }]);
  });

  it('ignores keep-alive comments and non-data fields', () => {
    const decoder = createAssistantEventDecoder();
    const chunk = `: keep-alive\n\nevent: message\ndata: ${JSON.stringify({
      type: 'token',
      text: 'ok',
    })}\nid: 7\n\n`;

    expect(decoder.push(chunk)).toEqual([{ type: 'token', text: 'ok' }]);
  });

  it('accepts CRLF line endings, including a split between CR and LF', () => {
    const decoder = createAssistantEventDecoder();

    expect(decoder.push('data: {"type":"token","text":"x"}\r')).toEqual([]);
    expect(decoder.push('\n\r\n')).toEqual([{ type: 'token', text: 'x' }]);
  });

  it('surfaces malformed JSON as an error event instead of throwing', () => {
    const decoder = createAssistantEventDecoder();

    expect(decoder.push('data: {not json\n\n')).toEqual([
      {
        type: 'error',
        code: 'malformed_frame',
        message: 'Received a stream frame that is not valid JSON.',
      },
    ]);
  });

  it('rejects frames that do not match the event contract', () => {
    const decoder = createAssistantEventDecoder();

    // Right shape, unknown discriminator.
    expect(decoder.push(frame({ type: 'reboot_the_table', text: 'hi' }))[0]?.type).toBe('error');
    // Known discriminator, missing required payload.
    expect(decoder.push(frame({ type: 'token' }))[0]?.type).toBe('error');
  });

  it('swallows the plain-text [DONE] sentinel', () => {
    const decoder = createAssistantEventDecoder();

    expect(decoder.push('data: [DONE]\n\n')).toEqual([]);
  });

  it('reports buffered bytes when a stream ends mid-frame', () => {
    const decoder = createAssistantEventDecoder();

    decoder.push('data: {"type":"token","text":"tru');
    expect(decoder.hasPendingBytes()).toBe(true);

    decoder.push('ncated"}\n\n');
    expect(decoder.hasPendingBytes()).toBe(false);
  });
});
