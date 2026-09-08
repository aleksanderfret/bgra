import { existsSync, statfsSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import type { MachineSnapshot } from './capabilities';

function gibibytes(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function freeDiskGiB(path: string): number {
  try {
    const stats = statfsSync(path);
    return gibibytes(stats.bavail * stats.bsize);
  } catch {
    return 0;
  }
}

function isAppleSilicon(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }
  return cpus().some((cpu) => /apple/i.test(cpu.model));
}

/**
 * Best-effort GPU memory on Windows via PowerShell. Returns null when the
 * query fails or no discrete adapter reports memory.
 */
export async function readWindowsGpuMemoryGiB(): Promise<number | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '(Get-CimInstance Win32_VideoController | Measure-Object -Property AdapterRAM -Maximum).Maximum',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const parsed = Number.parseInt(stdout.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        resolve(null);
        return;
      }
      resolve(gibibytes(parsed));
    });
  });
}

export async function readMachineSnapshot(dataDir: string): Promise<MachineSnapshot> {
  const platform =
    process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
      ? process.platform
      : 'linux';

  const gpuMemoryGiB = platform === 'win32' ? await readWindowsGpuMemoryGiB() : null;

  return {
    platform,
    totalMemoryGiB: gibibytes(totalmem()),
    gpuMemoryGiB,
    freeDiskGiB: freeDiskGiB(existsSync(dataDir) ? dataDir : join(dataDir, '..')),
    appleSilicon: isAppleSilicon(),
  };
}

/** Exposed for diagnostics; not used for profile selection. */
export function readFreeMemoryGiB(): number {
  return gibibytes(freemem());
}
