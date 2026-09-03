import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const commitlintBin = join(root, 'node_modules', '.bin', 'commitlint');

function lint(message) {
  return spawnSync(commitlintBin, ['--verbose'], {
    cwd: root,
    encoding: 'utf8',
    input: `${message}\n`,
  });
}

describe('commitlint', () => {
  it('accepts a conventional header with a known scope', () => {
    const result = lint('feat(web): add color scheme switcher');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('accepts a why-body under a repo scope', () => {
    const result = lint(
      'chore(repo): add conventional commit helper\n\nStop inventing commit subjects at the prompt.',
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('rejects a prose subject', () => {
    const result = lint('Add a theme switcher');
    assert.notEqual(result.status, 0);
  });

  it('rejects an unknown scope', () => {
    const result = lint('feat(unknown): add thing');
    assert.notEqual(result.status, 0);
  });

  it('rejects a missing scope', () => {
    const result = lint('feat: add thing');
    assert.notEqual(result.status, 0);
  });
});

describe('run-cz-hook', () => {
  it('uses os.tcsetpgrp so macOS system Python 3.9 can run the wizard', () => {
    const src = readFileSync(join(root, 'scripts/run-cz-hook.py'), 'utf8');
    assert.match(src, /\bos\.tcsetpgrp\b/);
    assert.equal(src.includes('termios.tcsetpgrp'), false);
  });
});
