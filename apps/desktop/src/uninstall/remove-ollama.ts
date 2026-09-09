import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UninstallStepResult } from './run-uninstall';

export async function removeOwnedOllamaModels(options: {
  ollamaPath: string | null;
  tags: readonly string[];
  run?: (command: string, args: string[]) => Promise<number>;
}): Promise<UninstallStepResult> {
  if (options.ollamaPath === null) {
    return { id: 'models', ok: false, code: 'ollama_unavailable' };
  }
  const run =
    options.run ??
    ((command, args) =>
      new Promise<number>((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' });
        child.on('error', reject);
        child.on('exit', (code) => resolve(code ?? 1));
      }));

  try {
    for (const tag of options.tags) {
      await run(options.ollamaPath, ['rm', tag]);
    }
    return { id: 'models', ok: true };
  } catch {
    return { id: 'models', ok: false, code: 'ollama_unavailable' };
  }
}

export function ollamaAppPaths(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return ['/Applications/Ollama.app'];
  }
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const paths: string[] = [];
    if (local) {
      paths.push(join(local, 'Programs', 'Ollama'));
    }
    if (pf) {
      paths.push(join(pf, 'Ollama'));
    }
    return paths;
  }
  return [];
}

export async function removeOllamaApplication(options: {
  platform: NodeJS.Platform;
  exists?: (path: string) => boolean;
  remove?: (path: string) => void;
}): Promise<UninstallStepResult> {
  const exists = options.exists ?? existsSync;
  const remove =
    options.remove ??
    ((path: string) => {
      rmSync(path, { recursive: true, force: true });
    });
  const targets = ollamaAppPaths(options.platform).filter((path) => exists(path));
  if (targets.length === 0) {
    return { id: 'ollama', ok: true };
  }
  try {
    for (const path of targets) {
      remove(path);
    }
    return { id: 'ollama', ok: true };
  } catch {
    return { id: 'ollama', ok: false, code: 'ollama_remove_failed' };
  }
}

/** Packaged macOS: .../BGA.app/Contents/MacOS/BGA → .../BGA.app */
export function macAppBundleFromExecPath(execPath: string): string {
  return dirname(dirname(dirname(execPath)));
}
