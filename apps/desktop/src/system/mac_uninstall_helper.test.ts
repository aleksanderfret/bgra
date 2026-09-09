import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  copyMacUninstallHelperToApplications,
  MAC_UNINSTALL_APP_NAME,
  writeMacUninstallHelperApp,
} from './mac_uninstall_helper';

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeMacUninstallHelperApp', () => {
  it('writes a visible app that launches BGA with the uninstall flag', () => {
    const root = mkdtempSync(join(tmpdir(), 'bga-uninstall-helper-'));
    temps.push(root);
    const appRoot = writeMacUninstallHelperApp({
      destinationDir: root,
      bgaExecPath: '/Applications/BGA.app/Contents/MacOS/BGA',
      version: '0.1.0',
    });
    expect(appRoot).toBe(join(root, MAC_UNINSTALL_APP_NAME));
    const plist = readFileSync(join(appRoot, 'Contents', 'Info.plist'), 'utf8');
    expect(plist).not.toContain('LSUIElement');
    expect(plist).toContain('BGA Uninstall');
    const script = readFileSync(join(appRoot, 'Contents', 'MacOS', 'BGAUninstall'), 'utf8');
    expect(script).toContain('--bga-uninstall');
    expect(script).toContain('/Applications/BGA.app/Contents/MacOS/BGA');
  });
});

describe('copyMacUninstallHelperToApplications', () => {
  it('copies into a fake Applications folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'bga-uninstall-copy-'));
    temps.push(root);
    const source = writeMacUninstallHelperApp({
      destinationDir: join(root, 'src'),
      bgaExecPath: '/tmp/BGA',
      version: '0.1.0',
    });
    const applicationsDir = join(root, 'Applications');
    const result = copyMacUninstallHelperToApplications({ sourceApp: source, applicationsDir });
    expect(result.ok).toBe(true);
    expect(result.destination).toBe(join(applicationsDir, MAC_UNINSTALL_APP_NAME));
  });
});
