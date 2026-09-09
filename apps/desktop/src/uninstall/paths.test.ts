import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chromiumStorageDirNames, flattenDeletePaths, pathsForSelection } from './paths';
import type { UninstallSelection } from './selection';

const userData = '/tmp/bga-user';
const homeDir = '/Users/ada';

const none: UninstallSelection = {
  removeData: false,
  removeApplication: false,
  removeLlmModels: false,
  removeOllama: false,
};

describe('pathsForSelection', () => {
  it('returns no delete paths when nothing is selected', () => {
    const result = pathsForSelection({ userDataDir: userData, homeDir, selection: none });
    expect(flattenDeletePaths(result)).toEqual([]);
    expect(result.chromiumChatClear).toBe(false);
    expect(result.removeLlmModels).toBe(false);
    expect(result.removeOllama).toBe(false);
  });

  it('maps Data to storage and player and requests chromium chat clear', () => {
    const result = pathsForSelection({
      userDataDir: userData,
      homeDir,
      selection: { ...none, removeData: true },
    });
    expect(result.dataPaths).toEqual([join(userData, 'storage'), join(userData, 'player')]);
    expect(result.applicationPaths).toEqual([]);
    expect(result.chromiumChatClear).toBe(true);
  });

  it('Application-only excludes Chromium storage dirs', () => {
    const result = pathsForSelection({
      userDataDir: userData,
      homeDir,
      selection: { ...none, removeApplication: true },
    });
    const names = result.applicationPaths
      .filter((path) => path.startsWith(userData))
      .map((path) => path.slice(userData.length + 1));
    expect(names).toEqual(
      expect.arrayContaining([
        'python-env',
        'logs',
        'setup-complete',
        'downloads',
        'diagnostics',
        'helpers',
        'hf-cache',
      ]),
    );
    for (const chromium of chromiumStorageDirNames) {
      expect(names).not.toContain(chromium);
    }
    expect(result.wipeUserDataRoot).toBeNull();
    expect(result.chromiumChatClear).toBe(false);
  });

  it('Application includes scoped legacy Hugging Face hub dirs', () => {
    const result = pathsForSelection({
      userDataDir: userData,
      homeDir,
      selection: { ...none, removeApplication: true },
    });
    expect(result.applicationPaths).toEqual(
      expect.arrayContaining([
        join(homeDir, '.cache', 'huggingface', 'hub', 'models--BAAI--bge-reranker-v2-m3'),
        join(
          homeDir,
          '.cache',
          'huggingface',
          'hub',
          'models--mlx-community--whisper-large-v3-turbo',
        ),
      ]),
    );
  });

  it('both Data and Application wipe the whole userData root', () => {
    const result = pathsForSelection({
      userDataDir: userData,
      homeDir,
      selection: { ...none, removeData: true, removeApplication: true },
    });
    expect(result.wipeUserDataRoot).toBe(userData);
    expect(flattenDeletePaths(result)).toEqual([userData]);
    expect(result.chromiumChatClear).toBe(true);
  });

  it('passes through model and Ollama flags without adding ollama blob dirs', () => {
    const result = pathsForSelection({
      userDataDir: userData,
      homeDir,
      selection: { ...none, removeLlmModels: true, removeOllama: true },
    });
    expect(flattenDeletePaths(result)).toEqual([]);
    expect(result.removeLlmModels).toBe(true);
    expect(result.removeOllama).toBe(true);
    expect(flattenDeletePaths(result).some((path) => path.includes('.ollama'))).toBe(false);
  });
});
