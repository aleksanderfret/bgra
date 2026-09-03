/**
 * Rules behind the single route that connects the browser to the engine.
 *
 * They live here rather than in `route.ts` so they can be tested without
 * building a `NextRequest`, and so the allowlists are readable in one place.
 */

/** Everything else is the browser's business, not the engine's. */
const REQUEST_ALLOWLIST = ['content-type', 'accept', 'accept-language'] as const;

/** The engine may not set cookies, redirects or caching policy for the app. */
const RESPONSE_ALLOWLIST = [
  'content-type',
  'content-length',
  'content-disposition',
  'etag',
  'last-modified',
] as const;

/** A stalled `/games` is a bug; a long generation or PDF import is not. */
export const ENGINE_TIMEOUT_MS = 10_000;

export type EngineRouteKind = 'stream' | 'asset' | 'api' | 'long';

export function routeKind(segments: string[]): EngineRouteKind {
  switch (segments[0]) {
    case 'ask':
      return 'stream';
    case 'static':
      return 'asset';
    case 'ingest':
      return 'long';
    default:
      return 'api';
  }
}

/**
 * `null` when the path is not addressable. Segments are encoded individually
 * so one of them cannot smuggle in extra path levels.
 */
export function engineTarget(baseUrl: string, segments: string[], search: string): URL | null {
  if (segments.length === 0) {
    return null;
  }
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }

  const target = new URL(`/${segments.map(encodeURIComponent).join('/')}`, baseUrl);
  target.search = search;
  return target;
}

/** Where the engine is mounted on this app's origin. */
export const ENGINE_BASE_PATH = '/api/engine';

/**
 * Turns an engine-root-relative path (`/static/assets/azul/p04.png`) into one
 * the browser can fetch. The engine addresses its own routes and does not know
 * this prefix; `null` for anything else, because an absolute URL would fetch
 * from the engine directly, around the one route allowed to reach it.
 */
export function engineAssetUrl(enginePath: string): string | null {
  if (!enginePath.startsWith('/') || enginePath.startsWith('//')) {
    return null;
  }
  return `${ENGINE_BASE_PATH}${enginePath}`;
}

export function requestHeadersForEngine(incoming: Headers): Headers {
  const headers = new Headers();
  for (const name of REQUEST_ALLOWLIST) {
    const value = incoming.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

export function responseHeadersFromEngine(upstream: Headers, kind: EngineRouteKind): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_ALLOWLIST) {
    const value = upstream.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  if (kind === 'asset') {
    headers.set('cache-control', 'private, max-age=3600');
    return headers;
  }

  if (kind === 'stream') {
    headers.set('cache-control', 'no-cache, no-transform');
    // Stops an intermediate proxy from holding frames back to the end.
    headers.set('x-accel-buffering', 'no');
    return headers;
  }

  headers.set('cache-control', 'no-store');
  return headers;
}
