import { join } from 'node:path';
import type { NextConfig } from 'next';

// Mantine ships inline styles and `ColorSchemeScript` is an inline script, so
// a blocking policy would need nonces first. Report-only records what a strict
// policy would break; tightening it belongs with the HTTPS work in stage 5.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

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

  // This repo keeps one AGENTS.md, at the root. A generated copy under apps/web
  // would be a second set of instructions, drifting from the first.
  agentRules: false,

  experimental: {
    // Mantine re-exports its whole surface from one entry point; without this
    // the dev server pulls in every component on first compile.
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },

  // No rewrite to the engine lives here on purpose (decision D9): images and
  // audio go through /api/engine/* like everything else, so the access check
  // in that route handler cannot be bypassed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
          { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
