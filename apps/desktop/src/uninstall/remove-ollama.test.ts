import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  macAppBundleFromExecPath,
  ollamaAppPaths,
  removeOllamaApplication,
  removeOwnedOllamaModels,
} from './remove-ollama';

describe('removeOwnedOllamaModels', () => {
  it('fails when ollama is missing', async () => {
    await expect(removeOwnedOllamaModels({ ollamaPath: null, tags: ['bge-m3'] })).resolves.toEqual({
      id: 'models',
      ok: false,
      code: 'ollama_unavailable',
    });
  });

  it('runs rm for each tag and ignores non-zero exits', async () => {
    const calls: string[][] = [];
    const result = await removeOwnedOllamaModels({
      ollamaPath: '/usr/local/bin/ollama',
      tags: ['bge-m3', 'qwen3:8b'],
      run: async (_command, args) => {
        calls.push([...args]);
        return 1;
      },
    });
    expect(result).toEqual({ id: 'models', ok: true });
    expect(calls).toEqual([
      ['rm', 'bge-m3'],
      ['rm', 'qwen3:8b'],
    ]);
  });
});

describe('removeOllamaApplication', () => {
  it('removes existing Ollama.app on macOS', async () => {
    const removed: string[] = [];
    const result = await removeOllamaApplication({
      platform: 'darwin',
      exists: (path) => path === '/Applications/Ollama.app',
      remove: (path) => {
        removed.push(path);
      },
    });
    expect(result.ok).toBe(true);
    expect(removed).toEqual(['/Applications/Ollama.app']);
  });

  it('lists Windows candidate install dirs when env is set', () => {
    const previousLocal = process.env.LOCALAPPDATA;
    const previousPf = process.env.ProgramFiles;
    process.env.LOCALAPPDATA = 'C:\\Users\\ada\\AppData\\Local';
    process.env.ProgramFiles = 'C:\\Program Files';
    try {
      expect(ollamaAppPaths('win32')).toEqual([
        join('C:\\Users\\ada\\AppData\\Local', 'Programs', 'Ollama'),
        join('C:\\Program Files', 'Ollama'),
      ]);
    } finally {
      if (previousLocal === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = previousLocal;
      }
      if (previousPf === undefined) {
        delete process.env.ProgramFiles;
      } else {
        process.env.ProgramFiles = previousPf;
      }
    }
  });
});

describe('macAppBundleFromExecPath', () => {
  it('walks up from Contents/MacOS', () => {
    expect(macAppBundleFromExecPath('/Applications/BGA.app/Contents/MacOS/BGA')).toBe(
      '/Applications/BGA.app',
    );
  });
});
