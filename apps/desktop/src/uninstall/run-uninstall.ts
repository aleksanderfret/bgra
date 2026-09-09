import { existsSync, rmSync } from 'node:fs';
import { ownedOllamaTags } from './owned-models';
import { pathsForSelection } from './paths';
import type { UninstallSelection } from './selection';

export type UninstallStepId =
  | 'stop'
  | 'models'
  | 'data'
  | 'application'
  | 'ollama'
  | 'schedule_program_removal';

export interface UninstallStepResult {
  id: UninstallStepId;
  ok: boolean;
  code?: string;
}

export interface UninstallReport {
  steps: UninstallStepResult[];
  allSelectedOk: boolean;
  /** Paths to delete only after the process exits (avoids locked userData). */
  deferredDeletePaths: string[];
}

export interface DeletePathFs {
  exists: (path: string) => boolean;
  remove: (path: string) => void;
}

const defaultFs: DeletePathFs = {
  exists: existsSync,
  remove: (path) => {
    rmSync(path, { recursive: true, force: true });
  },
};

export function deletePathEntries(
  paths: readonly string[],
  id: Extract<UninstallStepId, 'data' | 'application'>,
  fs: DeletePathFs = defaultFs,
): UninstallStepResult[] {
  if (paths.length === 0) {
    return [{ id, ok: true }];
  }
  try {
    for (const path of paths) {
      if (fs.exists(path)) {
        fs.remove(path);
      }
    }
    return [{ id, ok: true }];
  } catch {
    return [{ id, ok: false, code: 'delete_failed' }];
  }
}

export interface RunUninstallDeps {
  /** Stop Next/engine (and owned ollama serve). Call only after model removal. */
  stopProcesses: () => void;
  clearChromiumChat: () => Promise<void>;
  removeOllamaModels: (tags: readonly string[]) => Promise<UninstallStepResult>;
  removeOllamaApp: () => Promise<UninstallStepResult>;
  scheduleProgramRemoval: (deferredPaths: readonly string[]) => UninstallStepResult;
  userDataDir: string;
  homeDir: string;
}

/**
 * Models first (needs Ollama API), then stop BGA processes, then disk cleanup.
 * Full userData wipe is deferred until after quit so LevelDB locks do not fail the step.
 */
export async function runUninstall(
  selection: UninstallSelection,
  deps: RunUninstallDeps,
): Promise<UninstallReport> {
  const steps: UninstallStepResult[] = [];
  const deferredDeletePaths: string[] = [];

  const plan = pathsForSelection({
    userDataDir: deps.userDataDir,
    homeDir: deps.homeDir,
    selection,
  });

  if (plan.removeLlmModels) {
    steps.push(await deps.removeOllamaModels(ownedOllamaTags()));
  }

  try {
    deps.stopProcesses();
    steps.push({ id: 'stop', ok: true });
  } catch {
    steps.push({ id: 'stop', ok: false, code: 'stop_failed' });
  }

  if (plan.wipeUserDataRoot !== null) {
    try {
      await deps.clearChromiumChat();
    } catch {
      // Deferred directory wipe still removes Chromium storage on disk.
    }
    deferredDeletePaths.push(plan.wipeUserDataRoot);
    steps.push({ id: 'data', ok: true });
    steps.push({ id: 'application', ok: true });
  } else {
    if (selection.removeData) {
      try {
        await deps.clearChromiumChat();
        steps.push(...deletePathEntries(plan.dataPaths, 'data'));
      } catch {
        steps.push({ id: 'data', ok: false, code: 'chat_clear_failed' });
      }
    }
    if (selection.removeApplication) {
      steps.push(...deletePathEntries(plan.applicationPaths, 'application'));
    }
  }

  if (plan.removeOllama) {
    steps.push(await deps.removeOllamaApp());
  }

  steps.push(deps.scheduleProgramRemoval(deferredDeletePaths));

  const selectedIds = new Set<UninstallStepId>(['stop', 'schedule_program_removal']);
  if (selection.removeLlmModels) {
    selectedIds.add('models');
  }
  if (selection.removeData) {
    selectedIds.add('data');
  }
  if (selection.removeApplication) {
    selectedIds.add('application');
  }
  if (selection.removeOllama) {
    selectedIds.add('ollama');
  }

  const allSelectedOk = steps.filter((step) => selectedIds.has(step.id)).every((step) => step.ok);

  return { steps, allSelectedOk, deferredDeletePaths };
}
