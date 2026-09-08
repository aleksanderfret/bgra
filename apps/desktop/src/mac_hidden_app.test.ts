import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureMacHiddenCliApp } from './mac_hidden_app';

describe('ensureMacHiddenCliApp', () => {
  it('writes an LSUIElement app that symlinks the target binary', () => {
    const root = mkdtempSync(join(tmpdir(), 'bga-hidden-'));
    const target = join(root, 'python-bin');
    writeFileSync(target, '#!/bin/sh\n', { mode: 0o755 });
    try {
      const wrapped = ensureMacHiddenCliApp({
        userDataDir: root,
        appFileName: 'BGAEngine.app',
        bundleId: 'local.bga.engine-helper',
        bundleName: 'BGA Engine',
        executableName: 'python',
        targetBinary: target,
      });
      expect(existsSync(wrapped)).toBe(true);
      expect(readlinkSync(wrapped)).toBe(target);
      expect(realpathSync(wrapped)).toBe(realpathSync(target));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes an exec trampoline that keeps the real venv binary', () => {
    const root = mkdtempSync(join(tmpdir(), 'bga-hidden-script-'));
    const target = join(root, 'python-bin');
    writeFileSync(target, '#!/bin/sh\n', { mode: 0o755 });
    try {
      const wrapped = ensureMacHiddenCliApp({
        userDataDir: root,
        appFileName: 'BGAEngine.app',
        bundleId: 'local.bga.engine-helper',
        bundleName: 'BGA Engine',
        executableName: 'BGAEngine',
        targetBinary: target,
        trampoline: 'exec-script',
      });
      expect(existsSync(wrapped)).toBe(true);
      expect(readFileSync(wrapped, 'utf8')).toContain(JSON.stringify(target));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
