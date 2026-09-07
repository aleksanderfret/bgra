#!/usr/bin/env node
/**
 * Materialise the engine venv for this machine.
 *
 * Locally we always install ingest + retrieval so `pnpm verify` cannot strip
 * LanceDB / the reranker and leave Ask saying search never started.
 * CI stays on ingest only — retrieval pulls native ML wheels the contract and
 * API tests do not need (see .github/workflows/ci.yml).
 */
import { spawnSync } from 'node:child_process';

const extras = ['--extra', 'ingest'];
if (process.env.CI !== 'true') {
  extras.push('--extra', 'retrieval');
}

const result = spawnSync('uv', ['sync', ...extras], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status === null ? 1 : result.status);
