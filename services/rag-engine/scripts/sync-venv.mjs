#!/usr/bin/env node
/**
 * Materialise the engine venv for this machine.
 *
 * Locally we install ingest + retrieval + speech so the desktop product path
 * and `pnpm dev` match (Ask, Learn, mic, Piper). CI stays on ingest only —
 * retrieval/speech pull native ML wheels the contract and API tests do not need
 * (see .github/workflows/ci.yml).
 */
import { spawnSync } from 'node:child_process';

const extras = ['--extra', 'ingest'];
if (process.env.CI !== 'true') {
  extras.push('--extra', 'retrieval', '--extra', 'speech');
}

const result = spawnSync('uv', ['sync', ...extras], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status === null ? 1 : result.status);
