import { join } from 'node:path';
import { huggingfaceRepoToHubDirName, ownedHuggingFaceRepos } from './owned-models';
import type { UninstallSelection } from './selection';

/** Chromium origin storage under Electron userData — holds chat localStorage. */
export const chromiumStorageDirNames = [
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Cookies',
  'Cookies-journal',
] as const;

const APPLICATION_RUNTIME_NAMES = [
  'python-env',
  'logs',
  'setup-complete',
  'downloads',
  'diagnostics',
  'helpers',
  'hf-cache',
] as const;

export interface UninstallPathPlan {
  /** When set, delete this root instead of the partitioned lists. */
  wipeUserDataRoot: string | null;
  dataPaths: string[];
  applicationPaths: string[];
  chromiumChatClear: boolean;
  removeLlmModels: boolean;
  removeOllama: boolean;
}

export function pathsForSelection(options: {
  userDataDir: string;
  homeDir: string;
  selection: UninstallSelection;
}): UninstallPathPlan {
  const { userDataDir, homeDir, selection } = options;
  const chromiumChatClear = selection.removeData;
  const removeLlmModels = selection.removeLlmModels;
  const removeOllama = selection.removeOllama;

  if (selection.removeData && selection.removeApplication) {
    return {
      wipeUserDataRoot: userDataDir,
      dataPaths: [],
      applicationPaths: [],
      chromiumChatClear,
      removeLlmModels,
      removeOllama,
    };
  }

  const dataPaths: string[] = [];
  if (selection.removeData) {
    dataPaths.push(join(userDataDir, 'storage'), join(userDataDir, 'player'));
  }

  const applicationPaths: string[] = [];
  if (selection.removeApplication) {
    for (const name of APPLICATION_RUNTIME_NAMES) {
      applicationPaths.push(join(userDataDir, name));
    }
    const hubRoot = join(homeDir, '.cache', 'huggingface', 'hub');
    for (const repo of ownedHuggingFaceRepos()) {
      applicationPaths.push(join(hubRoot, huggingfaceRepoToHubDirName(repo)));
    }
    // faster-whisper pulls this snapshot on Windows/Linux; not listed in profiles.
    applicationPaths.push(
      join(hubRoot, huggingfaceRepoToHubDirName('Systran/faster-whisper-large-v3-turbo')),
    );
  }

  return {
    wipeUserDataRoot: null,
    dataPaths,
    applicationPaths,
    chromiumChatClear,
    removeLlmModels,
    removeOllama,
  };
}

/** Flat list for previews/tests — never includes Chromium storage unless wiping root. */
export function flattenDeletePaths(plan: UninstallPathPlan): string[] {
  if (plan.wipeUserDataRoot !== null) {
    return [plan.wipeUserDataRoot];
  }
  return [...plan.dataPaths, ...plan.applicationPaths];
}
