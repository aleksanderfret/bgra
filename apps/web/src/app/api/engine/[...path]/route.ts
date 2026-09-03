import type { NextRequest } from 'next/server';
import {
  ENGINE_TIMEOUT_MS,
  engineTarget,
  requestHeadersForEngine,
  responseHeadersFromEngine,
  routeKind,
} from '@/lib/engine-proxy';

const ENGINE_URL = process.env.RAG_ENGINE_URL ?? 'http://127.0.0.1:8000';

export const dynamic = 'force-dynamic';

/**
 * The only way from the browser to the engine — answers, images and audio
 * alike. An access check belongs here and nowhere else, so no rewrite in
 * `next.config.ts` may route around it.
 */
function assertMayReachEngine(_request: NextRequest): void {}

function engineError(code: string, message: string, status: number): Response {
  return Response.json({ type: 'error', code, message }, { status });
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  assertMayReachEngine(request);

  const kind = routeKind(segments);
  const target = engineTarget(ENGINE_URL, segments, request.nextUrl.search);

  if (target === null) {
    return engineError('bad_engine_path', 'The requested engine path is not addressable.', 400);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const signal =
    kind === 'api'
      ? AbortSignal.any([request.signal, AbortSignal.timeout(ENGINE_TIMEOUT_MS)])
      : request.signal;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: requestHeadersForEngine(request.headers),
      body: hasBody ? request.body : undefined,
      // Node's fetch requires this whenever the request body is a stream.
      ...(hasBody ? { duplex: 'half' } : {}),
      cache: 'no-store',
      redirect: 'manual',
      signal,
    } as RequestInit);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeadersFromEngine(upstream.headers, kind),
    });
  } catch (error) {
    // Where the engine lives is not the browser's business; the detail goes to
    // the server log and the browser gets a code it can phrase.
    console.error(`Engine request to ${target.pathname} failed`, error);
    return engineError('engine_unreachable', 'The engine did not respond.', 502);
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
