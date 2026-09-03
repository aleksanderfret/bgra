import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { BinaryNotFoundError, resolveBinary } from './binaries';
import { type MachineSnapshot, type ProfileRecommendation, recommendProfile } from './capabilities';
import type { DesktopSetupState } from './desktop-api';
import { writeDiagnosticsFile } from './diagnostics';
import { isGameId } from './game-id';
import { readMachineSnapshot } from './machine';
import { findFreePort } from './ports';
import {
  engineArgs,
  type ManagedProcess,
  nextServerArgs,
  resolveEngineDir,
  resolveNextCli,
  resolveRepoRootFromDesktopPackage,
  resolveWebDir,
  spawnLogged,
  stopManaged,
  waitForHttp,
} from './processes';

if (typeof app === 'undefined') {
  console.error(
    'BGA desktop must be started with the Electron binary (unset ELECTRON_RUN_AS_NODE).',
  );
  process.exit(1);
}

const isDev = !app.isPackaged;
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';

let mainWindow: BrowserWindow | null = null;
let engineProcess: ManagedProcess | null = null;
let nextProcess: ManagedProcess | null = null;
let webPort = 3000;
let enginePort = 8000;
let machine: MachineSnapshot | null = null;
let recommendation: ProfileRecommendation | null = null;
let ollamaPath: string | null = null;
let uvPath: string | null = null;
let engineLogPath: string | null = null;
let nextLogPath: string | null = null;
let dataDir = '';

function packageRoot(): string {
  return join(__dirname, '..');
}

function repoRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'repo');
  }
  return resolveRepoRootFromDesktopPackage(packageRoot());
}

function bundledUvCandidate(): string | null {
  if (!app.isPackaged) {
    return null;
  }
  const name = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const candidate = join(process.resourcesPath, 'bin', name);
  return existsSync(candidate) ? candidate : null;
}

function setupCompletePath(): string {
  return join(app.getPath('userData'), 'setup-complete');
}

async function resolveTools(): Promise<void> {
  const preferUv = bundledUvCandidate();
  uvPath = resolveBinary({
    name: 'uv',
    platform: process.platform,
    homeDir: homedir(),
    prefer: preferUv ? [preferUv] : [],
    exists: existsSync,
  });

  try {
    ollamaPath = resolveBinary({
      name: 'ollama',
      platform: process.platform,
      homeDir: homedir(),
      exists: existsSync,
    });
  } catch (error) {
    if (error instanceof BinaryNotFoundError) {
      ollamaPath = null;
    } else {
      throw error;
    }
  }
}

async function startBackend(): Promise<void> {
  dataDir = join(app.getPath('userData'), 'storage');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true });

  machine = await readMachineSnapshot(dataDir);
  recommendation = recommendProfile(machine);

  await resolveTools();

  enginePort = await findFreePort(8000);
  webPort = await findFreePort(3000);

  const root = repoRoot();
  const engineDir = resolveEngineDir(root);
  const webDir = resolveWebDir(root);
  const logDir = join(app.getPath('userData'), 'logs');
  engineLogPath = join(logDir, 'engine.log');
  nextLogPath = join(logDir, 'next.log');

  if (uvPath === null) {
    throw new Error('uv is required to start the engine');
  }

  const profileEnv = recommendation?.profileId ?? 'starter-32gb';

  engineProcess = spawnLogged({
    label: 'engine',
    command: uvPath,
    args: engineArgs(enginePort),
    cwd: engineDir,
    env: {
      ...process.env,
      BGA_STORAGE_DIR: dataDir,
      BGA_OLLAMA_URL: process.env.BGA_OLLAMA_URL ?? 'http://127.0.0.1:11434',
      BGA_MODEL_PROFILE: process.env.BGA_MODEL_PROFILE ?? profileEnv,
    },
    logPath: engineLogPath,
  });

  if (isDev && process.env.BGA_WEB_URL) {
    const url = new URL(process.env.BGA_WEB_URL);
    webPort = Number(url.port || 3000);
    await waitForHttp(`http://127.0.0.1:${webPort}/pl`, { timeoutMs: 5_000 });
    await waitForHttp(`http://127.0.0.1:${enginePort}/health`, { timeoutMs: 60_000 });
    return;
  }

  if (app.isPackaged) {
    const standaloneServer = join(webDir, 'server.js');
    if (!existsSync(standaloneServer)) {
      throw new Error(
        `Packaged Next server missing at ${standaloneServer}. Rebuild with output: 'standalone'.`,
      );
    }
    nextProcess = spawnLogged({
      label: 'next',
      command: process.execPath,
      args: [standaloneServer],
      cwd: webDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOSTNAME: '127.0.0.1',
        PORT: String(webPort),
        RAG_ENGINE_URL: `http://127.0.0.1:${enginePort}`,
        NODE_ENV: 'production',
      },
      logPath: nextLogPath,
    });
  } else {
    const nextCli = resolveNextCli(webDir);
    if (!existsSync(nextCli)) {
      throw new Error(
        `Next.js CLI not found at ${nextCli}. Run pnpm install && pnpm --filter web build first.`,
      );
    }

    nextProcess = spawnLogged({
      label: 'next',
      command: process.execPath,
      args: nextServerArgs({
        nextCli,
        hostname: '127.0.0.1',
        port: webPort,
        webDir,
      }),
      cwd: webDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOSTNAME: '127.0.0.1',
        PORT: String(webPort),
        RAG_ENGINE_URL: `http://127.0.0.1:${enginePort}`,
        NODE_ENV: 'production',
      },
      logPath: nextLogPath,
    });
  }

  await waitForHttp(`http://127.0.0.1:${enginePort}/health`, { timeoutMs: 60_000 });
  await waitForHttp(`http://127.0.0.1:${webPort}/pl`, { timeoutMs: 60_000 });
}

function setupState(): DesktopSetupState {
  return {
    machine,
    recommendation,
    ollamaPath,
    ollamaDownloadUrl: OLLAMA_DOWNLOAD_URL,
    uvPath,
    setupComplete: existsSync(setupCompletePath()),
    ingestAvailable: false,
  };
}

function registerIpc(): void {
  ipcMain.handle('desktop:get-setup-state', () => setupState());

  ipcMain.handle('desktop:save-diagnostics', async () => {
    const path = writeDiagnosticsFile(join(app.getPath('userData'), 'diagnostics'), {
      createdAt: new Date().toISOString(),
      profile: recommendation,
      machine,
      engineLogPath,
      nextLogPath,
      notes: [
        `webPort=${webPort}`,
        `enginePort=${enginePort}`,
        `ollamaPath=${ollamaPath ?? 'missing'}`,
        `uvPath=${uvPath ?? 'missing'}`,
        `packaged=${app.isPackaged}`,
      ],
    });
    return { path };
  });

  ipcMain.handle(
    'desktop:import-pdf',
    async (_event, payload: { filePath: string; gameId: string }) => {
      if (!isGameId(payload.gameId)) {
        return { ok: false as const, reason: 'invalid_game_id' as const };
      }
      return { ok: false as const, reason: 'ingest_not_ready' as const };
    },
  );

  ipcMain.handle('desktop:mark-setup-complete', async () => {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(setupCompletePath(), '1', 'utf8');
    return setupState();
  });

  ipcMain.handle('desktop:open-external', async (_event, url: string) => {
    if (url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('desktop:pull-models', async (event) => {
    if (uvPath === null) {
      throw new Error('uv is not available');
    }
    const engineDir = resolveEngineDir(repoRoot());
    const profile = recommendation?.profileId ?? 'starter-32gb';
    const child = spawnLogged({
      label: 'pull-models',
      command: uvPath,
      args: ['run', 'python', '-m', 'rag_engine.pull_models', '--profile', profile],
      cwd: engineDir,
      env: {
        ...process.env,
        BGA_MODEL_PROFILE: profile,
        BGA_STORAGE_DIR: dataDir,
      },
      logPath: join(app.getPath('userData'), 'logs', 'pull-models.log'),
    });

    child.child.stdout?.on('data', (chunk: Buffer) => {
      event.sender.send('desktop:pull-models-progress', chunk.toString());
    });

    await new Promise<void>((resolve, reject) => {
      child.child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Model pull exited with code ${code}`));
        }
      });
      child.child.on('error', reject);
    });

    return { ok: true };
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const path = existsSync(setupCompletePath()) ? '/pl' : '/pl/setup';
  void mainWindow.loadURL(`http://127.0.0.1:${webPort}${path}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function installMicPermissionHandler(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
}

function shutdown(): void {
  stopManaged(nextProcess);
  stopManaged(engineProcess);
  nextProcess = null;
  engineProcess = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpc();
    installMicPermissionHandler();

    try {
      if (isDev && process.env.BGA_WEB_URL) {
        dataDir = join(app.getPath('userData'), 'storage');
        mkdirSync(dataDir, { recursive: true });
        machine = await readMachineSnapshot(dataDir);
        recommendation = recommendProfile(machine);
        await resolveTools();
        const url = new URL(process.env.BGA_WEB_URL);
        webPort = Number(url.port || 3000);
        enginePort = Number(process.env.BGA_ENGINE_PORT ?? 8000);
      } else {
        await startBackend();
      }
      createWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox('BGA failed to start', message);
      shutdown();
      app.quit();
    }
  });

  app.on('before-quit', () => {
    shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null && app.isReady()) {
      createWindow();
    }
  });
}
