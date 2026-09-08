import { describe, expect, it } from 'vitest';
import { desktopLaunchActions } from './launch-order';

describe('desktopLaunchActions', () => {
  it('opens the web UI before ensureRuntime on a returning launch', () => {
    expect(desktopLaunchActions({ returningPlayer: true }).map((action) => action.type)).toEqual([
      'startBackend',
      'loadAppPage',
      'ensureRuntime',
    ]);
  });

  it('skips retrieval warm and ensureRuntime on a first-open launch', () => {
    expect(desktopLaunchActions({ returningPlayer: false })).toEqual([
      { type: 'startBackend', skipRetrievalWarm: true },
      { type: 'loadAppPage' },
    ]);
  });
});
