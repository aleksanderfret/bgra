import { describe, expect, it } from 'vitest';
import { ENGINE_UV_SYNC_EXTRAS, engineUvSyncArgs } from './engine-uv-extras';

describe('engineUvSyncArgs', () => {
  it('installs retrieval, ingest, and speech for the packaged product', () => {
    expect([...ENGINE_UV_SYNC_EXTRAS]).toEqual(
      expect.arrayContaining(['retrieval', 'ingest', 'speech']),
    );
    expect(engineUvSyncArgs()).toEqual([
      'sync',
      '--frozen',
      '--extra',
      'retrieval',
      '--extra',
      'ingest',
      '--extra',
      'speech',
    ]);
  });
});
