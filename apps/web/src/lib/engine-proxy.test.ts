import { describe, expect, it } from 'vitest';
import {
  engineAssetUrl,
  engineTarget,
  requestHeadersForEngine,
  responseHeadersFromEngine,
  routeKind,
} from './engine-proxy';

const ENGINE = 'http://127.0.0.1:8000';

describe('routeKind', () => {
  it('separates the answer stream from plain API calls and assets', () => {
    expect(routeKind(['ask'])).toBe('stream');
    expect(routeKind(['static', 'assets', 'azul', 'p04.png'])).toBe('asset');
    expect(routeKind(['games'])).toBe('api');
    expect(routeKind([])).toBe('api');
  });
});

describe('engineTarget', () => {
  it('maps the proxied segments onto the engine path', () => {
    const target = engineTarget(ENGINE, ['static', 'assets', 'azul', 'p04.png'], '');

    expect(target?.href).toBe(`${ENGINE}/static/assets/azul/p04.png`);
  });

  it('keeps the query string', () => {
    expect(engineTarget(ENGINE, ['games'], '?locale=pl')?.search).toBe('?locale=pl');
  });

  it('refuses a path that tries to climb out', () => {
    expect(engineTarget(ENGINE, ['static', '..', '..', 'etc'], '')).toBeNull();
    expect(engineTarget(ENGINE, ['games', '.'], '')).toBeNull();
    expect(engineTarget(ENGINE, [], '')).toBeNull();
  });

  it('encodes a segment so it cannot add path levels of its own', () => {
    const target = engineTarget(ENGINE, ['static', 'a/../../b'], '');

    expect(target?.pathname).toBe('/static/a%2F..%2F..%2Fb');
  });
});

describe('requestHeadersForEngine', () => {
  it('passes only what the engine needs to answer', () => {
    const forwarded = requestHeadersForEngine(
      new Headers({
        'content-type': 'application/json',
        'accept-language': 'pl',
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        'x-forwarded-for': '10.0.0.7',
      }),
    );

    expect(forwarded.get('content-type')).toBe('application/json');
    expect(forwarded.get('accept-language')).toBe('pl');
    // Credentials stay with the app: the engine cannot verify them and must
    // never be able to act on them.
    expect(forwarded.get('cookie')).toBeNull();
    expect(forwarded.get('authorization')).toBeNull();
    expect(forwarded.get('x-forwarded-for')).toBeNull();
  });
});

describe('responseHeadersFromEngine', () => {
  it('does not let the engine set cookies or redirect the browser', () => {
    const headers = responseHeadersFromEngine(
      new Headers({
        'content-type': 'application/json',
        'set-cookie': 'admin=1',
        location: 'http://example.com',
      }),
      'api',
    );

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('set-cookie')).toBeNull();
    expect(headers.get('location')).toBeNull();
  });

  it('keeps the answer stream unbuffered', () => {
    const headers = responseHeadersFromEngine(new Headers(), 'stream');

    expect(headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(headers.get('x-accel-buffering')).toBe('no');
  });

  it('lets page renders be cached, unlike everything else', () => {
    expect(responseHeadersFromEngine(new Headers(), 'asset').get('cache-control')).toBe(
      'private, max-age=3600',
    );
    expect(responseHeadersFromEngine(new Headers(), 'api').get('cache-control')).toBe('no-store');
  });
});

describe('engineAssetUrl', () => {
  it('puts the engine path behind the proxy, which is the app\u2019s job and not the engine\u2019s', () => {
    expect(engineAssetUrl('/static/assets/azul/p04.png')).toBe(
      '/api/engine/static/assets/azul/p04.png',
    );
  });

  it('refuses anything that would leave this origin', () => {
    // An absolute URL would reach the engine without passing the one route
    // that is allowed to.
    expect(engineAssetUrl('http://127.0.0.1:8000/static/assets/azul/p04.png')).toBeNull();
    expect(engineAssetUrl('//evil.example/p04.png')).toBeNull();
    expect(engineAssetUrl('javascript:alert(1)')).toBeNull();
  });
});
