import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy so the browser never talks to Python directly — no CORS,
 * one place for an access check once a tablet is on the LAN.
 */

const ENGINE_URL = process.env.RAG_ENGINE_URL ?? 'http://127.0.0.1:8000';

export const dynamic = 'force-dynamic';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);

function forwardedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  const target = new URL(`/${segments.join('/')}`, ENGINE_URL);
  target.search = request.nextUrl.search;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: forwardedRequestHeaders(request),
      body: hasBody ? request.body : undefined,
      // Node's fetch requires this whenever the request body is a stream.
      ...(hasBody ? { duplex: 'half' } : {}),
      cache: 'no-store',
      redirect: 'manual',
    } as RequestInit);

    const headers = new Headers(upstream.headers);
    headers.set('cache-control', 'no-cache, no-transform');
    headers.set('x-accel-buffering', 'no');

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    // `code` is what the UI phrases; `message` stays an English diagnostic.
    return Response.json(
      {
        type: 'error',
        code: 'engine_unreachable',
        message: `Cannot reach the engine at ${ENGINE_URL}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      },
      { status: 502 },
    );
  }
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path);
}
