import type { SplashActivityCode } from './splash';

export type HealthProbe = {
  ollama: boolean;
  reranker: boolean;
  retrievalLoading: boolean;
  layoutIngest: boolean;
  missingModels: string[];
  llm: string;
  embedding: string;
};

export function parseHealthProbe(payload: unknown): HealthProbe | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const root = payload as Record<string, unknown>;
  const components = root.components;
  const models = root.models;
  const missingRaw = root.missingModels;
  if (components === null || typeof components !== 'object') {
    return null;
  }
  if (models === null || typeof models !== 'object') {
    return null;
  }
  if (!Array.isArray(missingRaw)) {
    return null;
  }
  const comps = components as Record<string, unknown>;
  const mods = models as Record<string, unknown>;
  if (typeof comps.ollama !== 'boolean' || typeof comps.reranker !== 'boolean') {
    return null;
  }
  let retrievalLoading: boolean | null = null;
  if (typeof comps.retrievalLoading === 'boolean') {
    retrievalLoading = comps.retrievalLoading;
  } else if (typeof comps.retrieval_loading === 'boolean') {
    retrievalLoading = comps.retrieval_loading;
  }
  if (retrievalLoading === null) {
    return null;
  }
  let layoutIngest = false;
  if (typeof comps.layoutIngest === 'boolean') {
    layoutIngest = comps.layoutIngest;
  } else if (typeof comps.layout_ingest === 'boolean') {
    layoutIngest = comps.layout_ingest;
  }
  if (typeof mods.llm !== 'string' || typeof mods.embedding !== 'string') {
    return null;
  }
  const missingModels = missingRaw.filter((item): item is string => typeof item === 'string');
  if (missingModels.length !== missingRaw.length) {
    return null;
  }
  return {
    ollama: comps.ollama,
    reranker: comps.reranker,
    retrievalLoading,
    layoutIngest,
    missingModels,
    llm: mods.llm,
    embedding: mods.embedding,
  };
}

export function liveProbeOk(probe: HealthProbe): boolean {
  return (
    probe.ollama && probe.missingModels.length === 0 && probe.reranker && !probe.retrievalLoading
  );
}

export function gatePassed(options: { setupCompleteFlag: boolean; probe: HealthProbe }): boolean {
  return options.setupCompleteFlag && liveProbeOk(options.probe);
}

/** Same name as `@bga/utils/locale-prefs` — desktop cannot import that package. */
export const UI_LOCALE_COOKIE_NAME = 'bga.locale';

export function desktopLocale(appLocale: string): 'en' | 'pl' {
  const lower = appLocale.toLowerCase();
  if (lower === 'pl' || lower.startsWith('pl-') || lower.startsWith('pl_')) {
    return 'pl';
  }
  return 'en';
}

/** Prefer the player's last UI choice; fall back to the OS language. */
export function resolveUiLocale(options: {
  appLocale: string;
  savedLocale: string | null | undefined;
}): 'en' | 'pl' {
  if (options.savedLocale === 'en' || options.savedLocale === 'pl') {
    return options.savedLocale;
  }
  return desktopLocale(options.appLocale);
}

export function argvHasUninstallFlag(argv: readonly string[]): boolean {
  return argv.includes('--bga-uninstall');
}

export function initialAppPath(options: {
  locale: 'en' | 'pl';
  gatePassed: boolean;
  uninstallMode?: boolean;
}): string {
  if (options.uninstallMode) {
    return `/${options.locale}/uninstall`;
  }
  return options.gatePassed ? `/${options.locale}/add-game` : `/${options.locale}/init`;
}

/** Paths the gated window may open before Ask is ready. */
export function isAllowedWhenGated(url: string, locale: 'en' | 'pl'): boolean {
  if (!/^http:\/\/127\.0\.0\.1:\d+/.test(url)) {
    return false;
  }
  const withoutOrigin = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '');
  const pathOnly = withoutOrigin.split('?')[0] ?? withoutOrigin;
  return isGatedAllowedPath(pathOnly, locale);
}

export function isGatedAllowedPath(path: string, locale: 'en' | 'pl'): boolean {
  const init = `/${locale}/init`;
  const settings = `/${locale}/settings`;
  const uninstall = `/${locale}/uninstall`;
  return (
    path === init ||
    path.startsWith(`${init}/`) ||
    path === settings ||
    path.startsWith(`${settings}/`) ||
    path === uninstall ||
    path.startsWith(`${uninstall}/`)
  );
}

export function splashActivityFromProbe(probe: HealthProbe): SplashActivityCode | null {
  if (probe.layoutIngest) {
    return 'reading_layout';
  }
  if (probe.retrievalLoading) {
    return 'preparing_search';
  }
  return null;
}

export function packagingUvRelativePath(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'bin/uv.exe';
  }
  // LSUIElement app wrapper so macOS does not show a blinking "exec" Dock icon.
  return 'bin/BGAUv.app/Contents/MacOS/uv';
}
