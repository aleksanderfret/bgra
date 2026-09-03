#!/usr/bin/env node
/**
 * Build the web standalone bundle, assert packaging layout, then run
 * electron-builder for the desktop app (unsigned).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './release-lib.mjs';

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('pnpm', ['--filter', 'web', 'build']);

const serverJs = join(repoRoot, 'apps/web/.next/standalone/apps/web/server.js');
const staticDir = join(repoRoot, 'apps/web/.next/static');

if (!existsSync(serverJs)) {
  console.error(
    `Missing Next standalone server at ${serverJs}. Check output: 'standalone' and monorepo layout.`,
  );
  process.exit(1);
}
if (!existsSync(staticDir)) {
  console.error(`Missing Next static assets at ${staticDir}.`);
  process.exit(1);
}

run('pnpm', ['--filter', 'desktop', 'run', 'package'], {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
});

console.log('Desktop package finished under apps/desktop/release/.');
