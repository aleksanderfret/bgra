#!/usr/bin/env node
/**
 * Reset local machine state for packaged desktop smoke tests.
 *
 *   pnpm reset:app
 *   pnpm reset:app --dry-run
 *   pnpm reset:app --ollama --models
 *   pnpm reset:app --cache
 *   pnpm reset:app --data
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { ollamaPresencePaths, parseResetAppArgs, resetAppTargets } from './reset-app-lib.mjs';

const HELP = `Reset this computer for a fresh BGA desktop first-run test.

Usage:
  pnpm reset:app                 Delete everything below (default)
  pnpm reset:app --dry-run       List only — delete nothing
  pnpm reset:app --ollama        Only the Ollama app install
  pnpm reset:app --models        Only downloaded Ollama models (~/.ollama)
  pnpm reset:app --cache         Only caches (Hugging Face / reranker, Ollama caches)
  pnpm reset:app --data          Only BGA app data (setup flag, storage, python-env)
  pnpm reset:app --ollama --models   Combine any of the flags

Default (no flags) = --ollama + --models + --cache + --data.
`;

function quitRelatedApps(platform) {
  if (platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "BGA" to quit'], { stdio: 'ignore' });
    spawnSync('osascript', ['-e', 'tell application "Ollama" to quit'], { stdio: 'ignore' });
    spawnSync('killall', ['Ollama'], { stdio: 'ignore' });
    spawnSync('killall', ['BGA'], { stdio: 'ignore' });
    spawnSync('killall', ['ollama'], { stdio: 'ignore' });
    return;
  }
  if (platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'Ollama.exe', '/F'], { stdio: 'ignore' });
    spawnSync('taskkill', ['/IM', 'BGA.exe', '/F'], { stdio: 'ignore' });
    spawnSync('taskkill', ['/IM', 'ollama.exe', '/F'], { stdio: 'ignore' });
  }
}

function main() {
  const flags = parseResetAppArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    process.exit(0);
  }

  const platform = process.platform;
  const homeDir = homedir();
  const targets = resetAppTargets({ platform, homeDir, scopes: flags.scopes });

  console.log(
    flags.scopes === 'all'
      ? 'Scope: everything (ollama + models + cache + data)'
      : `Scope: ${flags.scopes.join(', ')}`,
  );
  console.log('Targets:');
  for (const target of targets) {
    const mark = existsSync(target.path) ? 'present' : 'absent';
    console.log(`  [${mark}] (${target.scope}) ${target.path}`);
  }

  if (flags.dryRun) {
    console.log('\nDry run — nothing deleted.');
    process.exit(0);
  }

  console.log('\nQuitting BGA / Ollama if they are running…');
  quitRelatedApps(platform);
  const unlockUntil = Date.now() + 800;
  while (Date.now() < unlockUntil) {
    // Let macOS release file locks on quit.
  }

  console.log('Removing…');
  for (const target of targets) {
    if (!existsSync(target.path)) {
      continue;
    }
    try {
      rmSync(target.path, { recursive: true, force: true });
      console.log(`  removed (${target.scope}) ${target.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${target.path}: ${message}`);
      process.exitCode = 1;
    }
  }

  if (
    flags.scopes === 'all' ||
    flags.scopes.includes('ollama') ||
    flags.scopes.includes('models')
  ) {
    const leftover = ollamaPresencePaths({ platform, homeDir }).filter((path) => existsSync(path));
    const which = spawnSync('which', ['ollama'], { encoding: 'utf8' });
    const whichPath = which.status === 0 ? which.stdout.trim() : '';
    console.log('\nOllama check:');
    if (leftover.length === 0 && whichPath === '') {
      console.log('  OK — no Ollama app/binary/models at known paths.');
    } else {
      for (const path of leftover) {
        console.log(`  still present: ${path}`);
      }
      if (whichPath !== '') {
        console.log(`  still on PATH: ${whichPath}`);
      }
      console.log('  Not fully clean — remove leftovers, then re-run.');
      process.exitCode = 1;
    }
  }
}

main();
