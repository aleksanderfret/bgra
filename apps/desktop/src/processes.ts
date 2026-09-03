import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ManagedProcess {
  label: string;
  child: ChildProcess;
}

export interface SpawnLoggedOptions {
  label: string;
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
}

export function spawnLogged(options: SpawnLoggedOptions): ManagedProcess {
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log: WriteStream = createWriteStream(options.logPath, { flags: 'a' });
  const prefix = () => `[${new Date().toISOString()}] [${options.label}] `;

  child.stdout?.on('data', (chunk: Buffer) => {
    log.write(`${prefix()}${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    log.write(`${prefix()}${chunk.toString()}`);
  });
  child.on('exit', (code, signal) => {
    log.write(`${prefix()}exit code=${code} signal=${signal}\n`);
    log.end();
  });

  return { label: options.label, child };
}

export async function waitForHttp(
  url: string,
  options: { timeoutMs: number; intervalMs?: number } = { timeoutMs: 60_000 },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${url} after ${options.timeoutMs}ms`);
}

export function stopManaged(process: ManagedProcess | null): void {
  if (process === null || process.child.killed) {
    return;
  }
  process.child.kill('SIGTERM');
}

export function engineArgs(port: number): string[] {
  return ['run', 'uvicorn', 'rag_engine.main:app', '--host', '127.0.0.1', '--port', String(port)];
}

export function nextServerArgs(options: {
  nextCli: string;
  hostname: string;
  port: number;
  webDir: string;
}): string[] {
  // Run `next start` through Electron's Node (`ELECTRON_RUN_AS_NODE=1`).
  // Do not shell out to apps/web's package.json script: that script hard-codes
  // `--port 3000`, which would ignore a free-port choice.
  return [options.nextCli, 'start', '--hostname', options.hostname, '--port', String(options.port)];
}

export function resolveNextCli(webDir: string): string {
  return join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next');
}

export function resolveWebDir(repoRoot: string): string {
  return join(repoRoot, 'apps', 'web');
}

export function resolveEngineDir(repoRoot: string): string {
  return join(repoRoot, 'services', 'rag-engine');
}

export function resolveRepoRootFromDesktopPackage(desktopPackageDir: string): string {
  // apps/desktop → repo root
  return dirname(dirname(desktopPackageDir));
}
