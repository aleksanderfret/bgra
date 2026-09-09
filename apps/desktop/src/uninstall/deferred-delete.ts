import { spawn } from 'node:child_process';

export interface DeferredDeleteCommand {
  shell: string;
  args: string[];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Detached post-quit deleter: wait until `pid` exits, then remove each path.
 * Windows install-dir removal stays with NSIS after a successful UI exit;
 * this still covers Mac app bundles and optional leftover dirs.
 */
export function buildDeferredDeleteCommand(options: {
  platform: NodeJS.Platform;
  pid: number;
  paths: readonly string[];
}): DeferredDeleteCommand {
  const paths = options.paths.filter((path) => path.length > 0);
  if (options.platform === 'win32') {
    const wait = `ping -n 3 127.0.0.1 >nul & :loop & tasklist /FI "PID eq ${options.pid}" 2>nul | find "${options.pid}" >nul & if not errorlevel 1 (timeout /t 1 /nobreak >nul & goto loop)`;
    const removes = paths
      .map(
        (path) =>
          `if exist "${path}" rmdir /s /q "${path}" 2>nul & if exist "${path}" del /f /q "${path}" 2>nul`,
      )
      .join(' & ');
    return {
      shell: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `${wait} & ${removes}`],
    };
  }

  const wait = `while kill -0 ${options.pid} 2>/dev/null; do sleep 0.25; done`;
  const removes = paths.map((path) => `rm -rf ${shellQuote(path)}`).join('; ');
  return {
    shell: '/bin/bash',
    args: ['-c', `${wait}; ${removes}`],
  };
}

export function spawnDeferredDelete(options: {
  platform: NodeJS.Platform;
  pid: number;
  paths: readonly string[];
  spawnFn?: typeof spawn;
}): void {
  const command = buildDeferredDeleteCommand(options);
  const spawnImpl = options.spawnFn ?? spawn;
  const child = spawnImpl(command.shell, command.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}
