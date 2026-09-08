import { describe, expect, it } from 'vitest';
import { createIngestEventDecoder } from './ingest-event-stream';

const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

describe('createIngestEventDecoder', () => {
  it('decodes a progress frame', () => {
    const decoder = createIngestEventDecoder();
    expect(
      decoder.push(
        frame({
          type: 'ingest_progress',
          stage: 'drawing',
          current: 4,
          total: 10,
          percent: 52,
        }),
      ),
    ).toEqual([{ type: 'ingest_progress', stage: 'drawing', current: 4, total: 10, percent: 52 }]);
  });

  it('rejects an unknown ingest type', () => {
    const decoder = createIngestEventDecoder();
    expect(decoder.push(frame({ type: 'token', text: 'no' }))[0]?.type).toBe('error');
  });
});
