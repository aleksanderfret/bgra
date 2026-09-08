import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enginePythonArgs, resolveElectronNodeCommand } from './processes';

describe('enginePythonArgs', () => {
  it('starts uvicorn as a module so the venv python is the process image', () => {
    expect(enginePythonArgs(8123)).toEqual([
      '-m',
      'uvicorn',
      'rag_engine.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      '8123',
    ]);
  });
});

describe('resolveElectronNodeCommand', () => {
  it('keeps process.execPath off macOS or when unpackaged', () => {
    expect(
      resolveElectronNodeCommand({
        execPath: '/tmp/BGA',
        platform: 'linux',
        packaged: true,
      }),
    ).toBe('/tmp/BGA');
    expect(
      resolveElectronNodeCommand({
        execPath: '/tmp/BGA',
        platform: 'darwin',
        packaged: false,
      }),
    ).toBe('/tmp/BGA');
  });

  it('points at BGA Helper when that binary exists', () => {
    const execPath = '/Applications/BGA.app/Contents/MacOS/BGA';
    const helper = join(
      dirname(execPath),
      '..',
      'Frameworks',
      'BGA Helper.app',
      'Contents',
      'MacOS',
      'BGA Helper',
    );
    const result = resolveElectronNodeCommand({
      execPath,
      platform: 'darwin',
      packaged: true,
    });
    expect(result).toBe(existsSync(helper) ? helper : execPath);
  });
});
