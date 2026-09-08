import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ollamaPresencePaths, parseResetAppArgs, resetAppTargets } from './reset-app-lib.mjs';

describe('parseResetAppArgs', () => {
  it('defaults to all scopes', () => {
    assert.deepEqual(parseResetAppArgs([]), {
      dryRun: false,
      help: false,
      scopes: 'all',
    });
  });

  it('collects explicit scopes', () => {
    assert.deepEqual(parseResetAppArgs(['--ollama', '--cache', '--dry-run']).scopes, [
      'ollama',
      'cache',
    ]);
    assert.equal(parseResetAppArgs(['--models']).scopes[0], 'models');
    assert.equal(parseResetAppArgs(['--data']).scopes[0], 'data');
  });
});

describe('resetAppTargets', () => {
  it('includes every scope on darwin for all', () => {
    const paths = resetAppTargets({
      platform: 'darwin',
      homeDir: '/Users/me',
      scopes: 'all',
    }).map((item) => item.path);
    assert.ok(paths.includes('/Applications/Ollama.app'));
    assert.ok(paths.includes('/Users/me/.ollama'));
    assert.ok(paths.includes('/Users/me/.cache/huggingface'));
    assert.ok(paths.includes('/Users/me/Library/Application Support/desktop'));
    assert.ok(paths.includes('/Users/me/Library/Application Support/BGA'));
  });

  it('limits to requested scopes', () => {
    const items = resetAppTargets({
      platform: 'darwin',
      homeDir: '/Users/me',
      scopes: ['models'],
    });
    assert.deepEqual(
      items.map((item) => item.scope),
      ['models'],
    );
    assert.deepEqual(
      items.map((item) => item.path),
      ['/Users/me/.ollama'],
    );
  });
});

describe('ollamaPresencePaths', () => {
  it('lists Mac install and models', () => {
    const paths = ollamaPresencePaths({ platform: 'darwin', homeDir: '/Users/me' });
    assert.ok(paths.includes('/Applications/Ollama.app'));
    assert.ok(paths.includes('/Users/me/.ollama'));
  });
});
