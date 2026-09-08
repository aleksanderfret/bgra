import { describe, expect, it } from 'vitest';
import {
  blendUploadPercent,
  bootStageToActivity,
  enginePhaseToActivity,
  ingestProgressToActivity,
  isActivityCode,
  runtimeProgressToActivity,
  sendingActivity,
  UPLOAD_BAND_END,
} from './activity-progress';

describe('isActivityCode', () => {
  it('accepts a known code and rejects a sentence', () => {
    expect(isActivityCode('reading')).toBe(true);
    expect(isActivityCode('Reading the pages…')).toBe(false);
  });
});

describe('runtimeProgressToActivity', () => {
  it('leaves install stages indeterminate except installer bytes', () => {
    expect(runtimeProgressToActivity({ stage: 'waiting_for_ollama' })).toEqual({
      activity: 'waiting_for_ollama',
      percent: null,
    });
    expect(runtimeProgressToActivity({ stage: 'pulling_models' })).toEqual({
      activity: 'pulling_models',
      percent: null,
    });
    expect(runtimeProgressToActivity({ stage: 'preparing_search' })).toEqual({
      activity: 'preparing_search',
      percent: null,
    });
  });

  it('maps installer bytes only when the total is a real size', () => {
    expect(
      runtimeProgressToActivity({
        stage: 'downloading_installer',
        receivedBytes: 50,
        totalBytes: 200,
      }),
    ).toEqual({ activity: 'downloading_installer', percent: 25 });
    expect(
      runtimeProgressToActivity({
        stage: 'downloading_installer',
        receivedBytes: 50,
      }),
    ).toEqual({ activity: 'downloading_installer', percent: null });
    expect(
      runtimeProgressToActivity({
        stage: 'downloading_installer',
        receivedBytes: 50,
        totalBytes: 0,
      }),
    ).toEqual({ activity: 'downloading_installer', percent: null });
  });

  it('hides ready and error — those are not wait states', () => {
    expect(runtimeProgressToActivity({ stage: 'ready' })).toBeNull();
    expect(runtimeProgressToActivity({ stage: 'error', code: 'pull_failed' })).toBeNull();
  });
});

describe('enginePhaseToActivity', () => {
  it('maps wait phases and ignores recovery', () => {
    expect(enginePhaseToActivity('starting')).toEqual({
      activity: 'preparing_search',
      percent: null,
    });
    expect(enginePhaseToActivity('reading_layout')).toEqual({
      activity: 'reading_layout',
      percent: null,
    });
    expect(enginePhaseToActivity('ready')).toBeNull();
    expect(enginePhaseToActivity('search_unavailable')).toBeNull();
    expect(enginePhaseToActivity('offline')).toBeNull();
  });
});

describe('bootStageToActivity', () => {
  it('never invents a percent', () => {
    expect(bootStageToActivity('checking_computer')).toEqual({
      activity: 'checking_computer',
      percent: null,
    });
  });
});

describe('ingestProgressToActivity', () => {
  it('copies the blended display percent and page counts', () => {
    expect(
      ingestProgressToActivity({
        stage: 'drawing',
        current: 4,
        total: 10,
        displayPercent: 57.76,
      }),
    ).toEqual({
      activity: 'drawing',
      percent: 58,
      current: 4,
      total: 10,
    });
  });
});

describe('blendUploadPercent', () => {
  it('maps upload-only progress into the leading band', () => {
    expect(blendUploadPercent({ uploadPercent: 50, serverPercent: null, shown: null })).toBe(
      UPLOAD_BAND_END / 2,
    );
    expect(blendUploadPercent({ uploadPercent: 100, serverPercent: null, shown: null })).toBe(
      UPLOAD_BAND_END,
    );
  });

  it('blends server work after the upload band and never goes backwards', () => {
    // drawing page 4/10 is server 52% in the Python helper → 12 + 0.88 * 52
    const drawingFourOfTen = blendUploadPercent({
      uploadPercent: 100,
      serverPercent: 52,
      shown: UPLOAD_BAND_END,
    });
    expect(drawingFourOfTen).toBe(58);
    expect(
      blendUploadPercent({
        uploadPercent: null,
        serverPercent: 10,
        shown: 60,
      }),
    ).toBe(60);
  });

  it('stays null when nothing is measured', () => {
    expect(
      blendUploadPercent({ uploadPercent: null, serverPercent: null, shown: null }),
    ).toBeNull();
  });
});

describe('sendingActivity', () => {
  it('is the client-only sending stage', () => {
    expect(sendingActivity(6)).toEqual({ activity: 'sending', percent: 6 });
  });
});
