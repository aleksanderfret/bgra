import { describe, expect, it } from 'vitest';
import {
  argvHasUninstallFlag,
  desktopLocale,
  gatePassed,
  initialAppPath,
  isAllowedWhenGated,
  liveProbeOk,
  packagingUvRelativePath,
  parseHealthProbe,
  splashActivityFromProbe,
} from './gate';

const readyProbe = {
  ollama: true,
  reranker: true,
  retrievalLoading: false,
  layoutIngest: false,
  missingModels: [] as string[],
  llm: 'chat',
  embedding: 'embed',
};

describe('parseHealthProbe', () => {
  it('reads the camelCase health contract', () => {
    const probe = parseHealthProbe({
      components: {
        ollama: true,
        reranker: false,
        retrievalLoading: true,
      },
      models: { llm: 'a', embedding: 'b' },
      missingModels: ['a'],
    });
    expect(probe).toEqual({
      ollama: true,
      reranker: false,
      retrievalLoading: true,
      layoutIngest: false,
      missingModels: ['a'],
      llm: 'a',
      embedding: 'b',
    });
  });

  it('returns null for a malformed payload', () => {
    expect(parseHealthProbe({})).toBeNull();
    expect(parseHealthProbe(null)).toBeNull();
  });
});

describe('liveProbeOk / gatePassed', () => {
  it('requires ollama, models, reranker, and settled loading', () => {
    expect(liveProbeOk(readyProbe)).toBe(true);
    expect(liveProbeOk({ ...readyProbe, ollama: false })).toBe(false);
    expect(liveProbeOk({ ...readyProbe, missingModels: ['x'] })).toBe(false);
    expect(liveProbeOk({ ...readyProbe, reranker: false })).toBe(false);
    expect(liveProbeOk({ ...readyProbe, retrievalLoading: true })).toBe(false);
  });

  it('needs the flag and a live probe', () => {
    expect(gatePassed({ setupCompleteFlag: true, probe: readyProbe })).toBe(true);
    expect(gatePassed({ setupCompleteFlag: false, probe: readyProbe })).toBe(false);
    expect(gatePassed({ setupCompleteFlag: true, probe: { ...readyProbe, reranker: false } })).toBe(
      false,
    );
  });
});

describe('splashActivityFromProbe', () => {
  it('prefers layout ingest over a generic search wait', () => {
    expect(
      splashActivityFromProbe({ ...readyProbe, layoutIngest: true, retrievalLoading: true }),
    ).toBe('reading_layout');
    expect(splashActivityFromProbe({ ...readyProbe, retrievalLoading: true })).toBe(
      'preparing_search',
    );
    expect(splashActivityFromProbe(readyProbe)).toBeNull();
  });
});

describe('desktopLocale / initialAppPath', () => {
  it('maps Polish locales and defaults to English', () => {
    expect(desktopLocale('pl')).toBe('pl');
    expect(desktopLocale('pl-PL')).toBe('pl');
    expect(desktopLocale('en-US')).toBe('en');
    expect(desktopLocale('de')).toBe('en');
  });

  it('sends gated launches to setup', () => {
    expect(initialAppPath({ locale: 'en', gatePassed: false })).toBe('/en/setup');
    expect(initialAppPath({ locale: 'pl', gatePassed: true })).toBe('/pl');
  });

  it('sends uninstall mode to the uninstall route even when gated', () => {
    expect(initialAppPath({ locale: 'en', gatePassed: false, uninstallMode: true })).toBe(
      '/en/uninstall',
    );
  });
});

describe('argvHasUninstallFlag / isAllowedWhenGated', () => {
  it('detects the uninstall CLI flag', () => {
    expect(argvHasUninstallFlag(['electron', '.'])).toBe(false);
    expect(argvHasUninstallFlag(['electron', '.', '--bga-uninstall'])).toBe(true);
  });

  it('allows setup and uninstall under the gate with path boundaries', () => {
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en/setup', 'en')).toBe(true);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en/uninstall', 'en')).toBe(true);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en/uninstall?x=1', 'en')).toBe(true);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en', 'en')).toBe(false);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/pl/uninstall', 'en')).toBe(false);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en/uninstall-evil', 'en')).toBe(false);
    expect(isAllowedWhenGated('http://127.0.0.1:3000/en/setup-extra', 'en')).toBe(false);
  });
});

describe('packagingUvRelativePath', () => {
  it('matches electron-builder resources/bin layout', () => {
    expect(packagingUvRelativePath('darwin')).toBe('bin/BGAUv.app/Contents/MacOS/uv');
    expect(packagingUvRelativePath('win32')).toBe('bin/uv.exe');
  });
});
