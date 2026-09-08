/**
 * Path scopes for `pnpm reset:app` (desktop first-run smoke cleanup).
 */
import { join } from 'node:path';

/** @typedef {'ollama' | 'models' | 'cache' | 'data'} ResetScope */

/**
 * @param {string[]} argv
 * @returns {{
 *   dryRun: boolean;
 *   help: boolean;
 *   scopes: ResetScope[] | 'all';
 * }}
 */
export function parseResetAppArgs(argv) {
  const args = new Set(argv);
  /** @type {ResetScope[]} */
  const selected = [];
  if (args.has('--ollama')) {
    selected.push('ollama');
  }
  if (args.has('--models')) {
    selected.push('models');
  }
  if (args.has('--cache')) {
    selected.push('cache');
  }
  if (args.has('--data')) {
    selected.push('data');
  }
  return {
    dryRun: args.has('--dry-run'),
    help: args.has('--help') || args.has('-h'),
    scopes: selected.length === 0 ? 'all' : selected,
  };
}

/**
 * @param {{
 *   platform: NodeJS.Platform;
 *   homeDir: string;
 *   scopes: ResetScope[] | 'all';
 * }} options
 * @returns {{ path: string; scope: ResetScope }[]}
 */
export function resetAppTargets(options) {
  const { platform, homeDir, scopes } = options;
  const want = (scope) => scopes === 'all' || scopes.includes(scope);

  /** @type {{ path: string; scope: ResetScope }[]} */
  const targets = [];

  if (want('ollama')) {
    if (platform === 'darwin') {
      targets.push({ scope: 'ollama', path: join('/Applications', 'Ollama.app') });
    } else if (platform === 'win32') {
      targets.push({
        scope: 'ollama',
        path: join(homeDir, 'AppData', 'Local', 'Programs', 'Ollama'),
      });
    }
  }

  if (want('models')) {
    targets.push({ scope: 'models', path: join(homeDir, '.ollama') });
    if (platform === 'win32') {
      targets.push({
        scope: 'models',
        path: join(homeDir, 'AppData', 'Local', 'Ollama'),
      });
    }
  }

  if (want('cache')) {
    targets.push({ scope: 'cache', path: join(homeDir, '.cache', 'huggingface') });
    if (platform === 'darwin') {
      targets.push({
        scope: 'cache',
        path: join(homeDir, 'Library', 'Caches', 'Ollama'),
      });
      targets.push({
        scope: 'cache',
        path: join(homeDir, 'Library', 'Caches', 'huggingface'),
      });
    } else if (platform === 'win32') {
      targets.push({
        scope: 'cache',
        path: join(homeDir, 'AppData', 'Local', 'huggingface'),
      });
    }
  }

  if (want('data')) {
    if (platform === 'darwin') {
      targets.push({
        scope: 'data',
        path: join(homeDir, 'Library', 'Application Support', 'desktop'),
      });
      targets.push({
        scope: 'data',
        path: join(homeDir, 'Library', 'Application Support', 'BGA'),
      });
      targets.push({
        scope: 'data',
        path: join(homeDir, 'Library', 'Saved Application State', 'com.electron.ollama.savedState'),
      });
    } else if (platform === 'win32') {
      targets.push({
        scope: 'data',
        path: join(homeDir, 'AppData', 'Roaming', 'desktop'),
      });
      targets.push({
        scope: 'data',
        path: join(homeDir, 'AppData', 'Roaming', 'BGA'),
      });
    } else {
      targets.push({
        scope: 'data',
        path: join(homeDir, '.local', 'share', 'desktop'),
      });
      targets.push({
        scope: 'data',
        path: join(homeDir, '.local', 'share', 'BGA'),
      });
    }
  }

  return targets;
}

/**
 * @param {{ platform: NodeJS.Platform; homeDir: string }} options
 * @returns {string[]}
 */
export function ollamaPresencePaths(options) {
  const { platform, homeDir } = options;
  if (platform === 'darwin') {
    return [
      join('/Applications', 'Ollama.app'),
      join('/opt', 'homebrew', 'bin', 'ollama'),
      join('/usr', 'local', 'bin', 'ollama'),
      join(homeDir, '.local', 'bin', 'ollama'),
      join(homeDir, '.ollama'),
    ];
  }
  if (platform === 'win32') {
    return [
      join(homeDir, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe',
      join(homeDir, '.ollama'),
    ];
  }
  return [
    join('/usr', 'local', 'bin', 'ollama'),
    join(homeDir, '.local', 'bin', 'ollama'),
    join(homeDir, '.ollama'),
  ];
}
