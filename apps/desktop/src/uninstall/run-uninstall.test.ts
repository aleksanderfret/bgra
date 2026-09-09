import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeferredDeleteCommand } from './deferred-delete';
import { deletePathEntries, runUninstall, type UninstallStepResult } from './run-uninstall';
import { defaultUninstallSelection } from './selection';

describe('deletePathEntries', () => {
  it('removes existing paths and records ok', () => {
    const root = mkdtempSync(join(tmpdir(), 'bga-uninstall-'));
    const storage = join(root, 'storage');
    mkdirSync(storage);
    writeFileSync(join(storage, 'x.txt'), 'hi');

    const steps = deletePathEntries([storage], 'data');
    expect(steps).toEqual([{ id: 'data', ok: true }]);
    expect(existsSync(storage)).toBe(false);
  });

  it('treats missing paths as ok', () => {
    const steps = deletePathEntries(['/tmp/bga-does-not-exist-xyz'], 'application');
    expect(steps).toEqual([{ id: 'application', ok: true }]);
  });

  it('records failure when remove throws', () => {
    const steps = deletePathEntries(['/tmp/x'], 'application', {
      exists: () => true,
      remove: () => {
        throw new Error('EPERM');
      },
    });
    expect(steps[0]?.ok).toBe(false);
    expect(steps[0]?.code).toBe('delete_failed');
  });
});

describe('buildDeferredDeleteCommand', () => {
  it('builds a mac shell that waits for pid then removes paths', () => {
    const cmd = buildDeferredDeleteCommand({
      platform: 'darwin',
      pid: 4242,
      paths: ['/Applications/BGA.app', '/Applications/BGA Uninstall.app'],
    });
    expect(cmd.shell).toBe('/bin/bash');
    expect(cmd.args[0]).toBe('-c');
    const script = cmd.args[1] ?? '';
    expect(script).toContain('4242');
    expect(script).toContain('/Applications/BGA.app');
    expect(script).toContain('/Applications/BGA Uninstall.app');
  });

  it('builds a windows cmd that waits for pid then removes paths', () => {
    const cmd = buildDeferredDeleteCommand({
      platform: 'win32',
      pid: 99,
      paths: ['C:\\Program Files\\BGA'],
    });
    expect(cmd.shell.toLowerCase()).toContain('cmd');
    const script = cmd.args.join(' ');
    expect(script).toContain('99');
    expect(script).toContain('C:\\Program Files\\BGA');
  });

  it('uses bash on linux for the skeleton path', () => {
    const cmd = buildDeferredDeleteCommand({
      platform: 'linux',
      pid: 1,
      paths: ['/opt/BGA'],
    });
    expect(cmd.shell).toBe('/bin/bash');
  });
});

describe('UninstallStepResult shape', () => {
  it('allows optional code on failure', () => {
    const step: UninstallStepResult = { id: 'models', ok: false, code: 'ollama_unavailable' };
    expect(step.code).toBe('ollama_unavailable');
  });
});

describe('runUninstall', () => {
  it('runs models before stop so Ollama API is still up', async () => {
    const order: string[] = [];
    const report = await runUninstall(
      { ...defaultUninstallSelection(), removeLlmModels: true, removeData: true },
      {
        userDataDir: '/tmp/bga-user',
        homeDir: '/Users/ada',
        stopProcesses: () => {
          order.push('stop');
        },
        clearChromiumChat: async () => {
          order.push('chat');
        },
        removeOllamaModels: async () => {
          order.push('models');
          return { id: 'models', ok: true };
        },
        removeOllamaApp: async () => {
          order.push('ollama');
          return { id: 'ollama', ok: true };
        },
        scheduleProgramRemoval: (deferred) => {
          order.push('program');
          expect(deferred).toEqual([]);
          return { id: 'schedule_program_removal', ok: true };
        },
      },
    );
    expect(order).toEqual(['models', 'stop', 'chat', 'program']);
    expect(report.steps.map((step) => step.id)).toEqual([
      'models',
      'stop',
      'data',
      'schedule_program_removal',
    ]);
    expect(report.allSelectedOk).toBe(true);
  });

  it('defers full userData wipe until after quit', async () => {
    let deferred: readonly string[] = [];
    const report = await runUninstall(
      {
        ...defaultUninstallSelection(),
        removeData: true,
        removeApplication: true,
      },
      {
        userDataDir: '/tmp/bga-user',
        homeDir: '/Users/ada',
        stopProcesses: () => undefined,
        clearChromiumChat: async () => undefined,
        removeOllamaModels: async () => ({ id: 'models', ok: true }),
        removeOllamaApp: async () => ({ id: 'ollama', ok: true }),
        scheduleProgramRemoval: (paths) => {
          deferred = paths;
          return { id: 'schedule_program_removal', ok: true };
        },
      },
    );
    expect(deferred).toEqual(['/tmp/bga-user']);
    expect(report.deferredDeletePaths).toEqual(['/tmp/bga-user']);
    expect(report.steps.map((step) => step.id)).toEqual([
      'stop',
      'data',
      'application',
      'schedule_program_removal',
    ]);
  });

  it('marks allSelectedOk false when a selected step fails', async () => {
    const report = await runUninstall(
      { ...defaultUninstallSelection(), removeOllama: true },
      {
        userDataDir: '/tmp/bga-user',
        homeDir: '/Users/ada',
        stopProcesses: () => undefined,
        clearChromiumChat: async () => undefined,
        removeOllamaModels: async () => ({ id: 'models', ok: true }),
        removeOllamaApp: async () => ({ id: 'ollama', ok: false, code: 'ollama_remove_failed' }),
        scheduleProgramRemoval: () => ({ id: 'schedule_program_removal', ok: true }),
      },
    );
    expect(report.allSelectedOk).toBe(false);
  });
});
