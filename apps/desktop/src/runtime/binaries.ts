import { homedir } from 'node:os';
import { join } from 'node:path';

export type BinaryName = 'uv' | 'ollama';

export interface ResolveBinaryOptions {
  name: BinaryName;
  platform: NodeJS.Platform;
  homeDir?: string;
  exists: (absolutePath: string) => boolean;
  /** Extra candidates prepended (e.g. a bundled copy inside the app). */
  prefer?: readonly string[];
}

export class BinaryNotFoundError extends Error {
  readonly binaryName: BinaryName;
  readonly candidates: readonly string[];

  constructor(binaryName: BinaryName, candidates: readonly string[]) {
    super(
      `Could not find ${binaryName}. Checked: ${candidates.join(', ')}. ` +
        `Install it, then reopen the app from the Dock or Start menu.`,
    );
    this.binaryName = binaryName;
    this.candidates = candidates;
  }
}

export function candidatePathsFor(
  name: BinaryName,
  platform: NodeJS.Platform,
  homeDir: string = homedir(),
): string[] {
  const homeBin = join(homeDir, '.local', 'bin', name);
  const brewOpt = join('/opt', 'homebrew', 'bin', name);
  const usrLocal = join('/usr', 'local', 'bin', name);

  if (name === 'uv') {
    if (platform === 'win32') {
      return [
        join(homeDir, '.local', 'bin', 'uv.exe'),
        join(homeDir, 'AppData', 'Local', 'Programs', 'uv', 'uv.exe'),
        'C:\\Program Files\\uv\\uv.exe',
      ];
    }
    return [homeBin, brewOpt, usrLocal];
  }

  if (platform === 'win32') {
    return [
      join(homeDir, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe',
    ];
  }

  return [
    brewOpt,
    usrLocal,
    join('/Applications', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
    homeBin,
  ];
}

/**
 * Pure path resolution: the caller supplies `exists` so unit tests never touch
 * the real filesystem, and so a Dock-launched app does not rely on PATH.
 */
export function resolveBinary(options: ResolveBinaryOptions): string {
  const homeDir = options.homeDir ?? homedir();
  const candidates = [
    ...(options.prefer ?? []),
    ...candidatePathsFor(options.name, options.platform, homeDir),
  ];

  for (const candidate of candidates) {
    if (options.exists(candidate)) {
      return candidate;
    }
  }

  throw new BinaryNotFoundError(options.name, candidates);
}
