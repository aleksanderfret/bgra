import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo looking for a lockfile and
  // picks a root outside git. Point it at the workspace root so that
  // `@bga/api-contract` resolves from source.
  turbopack: {
    root: join(import.meta.dirname, '..', '..'),
  },

  // The contract package is consumed straight from TypeScript source, so there
  // is no build step to sequence before `next dev`.
  transpilePackages: ['@bga/api-contract'],

  experimental: {
    // Mantine re-exports its whole surface from one entry point; without this
    // the dev server pulls in every component on first compile.
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },

  // Everything the browser needs is same-origin: figure images and audio are
  // proxied through /api/engine/* so no CORS headers are involved anywhere.
  async rewrites() {
    return [
      {
        source: '/api/engine/static/:path*',
        destination: `${process.env.RAG_ENGINE_URL ?? 'http://127.0.0.1:8000'}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
