import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
import type { DesktopSetupState, RuntimeProgress } from '../ipc/desktop-api';
import { BinaryNotFoundError, resolveBinary } from '../runtime/binaries';
import {
  downloadAllowlistedFile,
  installerDestination,
  OLLAMA_DOWNLOAD_PAGE,
  ollamaInstallerUrl,
} from '../runtime/ollama_runtime';
import { findFreePort } from '../runtime/ports';
import {
  engineArgs,
  enginePythonArgs,
  type ManagedProcess,
  nextServerArgs,
  resolveElectronNodeCommand,
  resolveEngineDir,
  resolveNextCli,
  resolveRepoRootFromDesktopPackage,
  resolveWebDir,
  spawnLogged,
  stopManaged,
  waitForExit,
  waitForHttp,
  waitForHttpWhileAlive,
} from '../runtime/processes';
import { writeDiagnosticsFile } from '../setup/diagnostics';
import {
  desktopLocale,
  gatePassed,
  type HealthProbe,
  initialAppPath,
  liveProbeOk,
  parseHealthProbe,
  splashActivityFromProbe,
} from '../setup/gate';
import { desktopLaunchActions } from '../setup/launch-order';
import {
  applySplashActivity,
  buildSplashHtml,
  readStartupCopy,
  type SplashActivityCode,
  splashDataUrl,
} from '../setup/splash';
import {
  type MachineSnapshot,
  type ProfileRecommendation,
  recommendProfile,
} from '../system/capabilities';
import { ensureMacHiddenCliApp } from '../system/mac_hidden_app';
import { readMachineSnapshot } from '../system/machine';

if (typeof app === 'undefined') {
  console.error(
    'BGA desktop must be started with the Electron binary (unset ELECTRON_RUN_AS_NODE).',
  );
  process.exit(1);
}

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let engineProcess: ManagedProcess | null = null;
let nextProcess: ManagedProcess | null = null;
let ollamaServeProcess: ManagedProcess | null = null;
let ollamaServeOwned = false;
let webPort = 3000;
let enginePort = 8000;
let machine: MachineSnapshot | null = null;
let recommendation: ProfileRecommendation | null = null;
let ollamaPath: string | null = null;
let uvPath: string | null = null;
let engineLogPath: string | null = null;
let nextLogPath: string | null = null;
let dataDir = '';
let uiLocale: 'en' | 'pl' = 'en';
let lastProbe: HealthProbe | null = null;
let ensureRuntimeBusy = false;
let backendsReady = false;
let pendingSplashActivity: SplashActivityCode = 'checking_computer';
const windowsWithNavigationLock = new WeakSet<BrowserWindow>();

function packageRoot(): string {
  return join(__dirname, '../..');
}

function repoRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'repo');
  }
  return resolveRepoRootFromDesktopPackage(packageRoot());
}

function pythonEnvDir(): string {
  return join(app.getPath('userData'), 'python-env');
}

function uvEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_PROJECT_ENVIRONMENT: pythonEnvDir(),
  };
}

function bundledUvCandidate(): string | null {
  if (!app.isPackaged) {
    return null;
  }
  if (process.platform === 'win32') {
    const candidate = join(process.resourcesPath, 'bin', 'uv.exe');
    return existsSync(candidate) ? candidate : null;
  }
  const wrapped = join(process.resourcesPath, 'bin', 'BGAUv.app', 'Contents', 'MacOS', 'uv');
  if (existsSync(wrapped)) {
    return wrapped;
  }
  const legacy = join(process.resourcesPath, 'bin', 'uv');
  return existsSync(legacy) ? legacy : null;
}

function setupCompletePath(): string {
  return join(app.getPath('userData'), 'setup-complete');
}

function setupCompleteFlagExists(): boolean {
  return existsSync(setupCompletePath());
}

function writeSetupCompleteFlag(): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(setupCompletePath(), '1', 'utf8');
}

function clearSetupCompleteFlag(): void {
  if (setupCompleteFlagExists()) {
    unlinkSync(setupCompletePath());
  }
}

function emitRuntimeProgress(progress: RuntimeProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('desktop:runtime-progress', progress);
  }
}

function writeSplashActivity(code: SplashActivityCode): void {
  applySplashActivity({
    target: mainWindow?.webContents ?? null,
    localesDir: i18nLocalesDir(),
    locale: uiLocale,
    code,
  });
}

function pushSplashActivity(code: SplashActivityCode): void {
  pendingSplashActivity = code;
  if (mainWindow === null || mainWindow.webContents.isLoading()) {
    return;
  }
  writeSplashActivity(code);
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

async function syncPythonEnvironment(engineDir: string): Promise<void> {
  if (uvPath === null) {
    throw new Error('uv is required to sync the Python environment');
  }
  mkdirSync(pythonEnvDir(), { recursive: true });
  const child = spawnLogged({
    label: 'uv-sync',
    command: uvPath,
    args: ['sync', '--frozen', '--extra', 'retrieval', '--extra', 'ingest'],
    cwd: engineDir,
    env: uvEnv(),
    logPath: join(app.getPath('userData'), 'logs', 'uv-sync.log'),
  });
  const code = await waitForExit(child.child);
  if (code !== 0) {
    throw new Error(`uv sync failed with exit code ${code}`);
  }
}

async function fetchHealthProbe(): Promise<HealthProbe | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${enginePort}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      return null;
    }
    return parseHealthProbe(await response.json());
  } catch {
    return null;
  }
}

async function refreshProbe(): Promise<HealthProbe | null> {
  lastProbe = await fetchHealthProbe();
  return lastProbe;
}

function currentGatePassed(): boolean {
  if (lastProbe === null) {
    return false;
  }
  return gatePassed({
    setupCompleteFlag: setupCompleteFlagExists(),
    probe: lastProbe,
  });
}

function setupState(): DesktopSetupState {
  const probe = lastProbe;
  const askReady = probe !== null && liveProbeOk(probe);
  return {
    machine,
    recommendation,
    ollamaPath,
    ollamaDownloadUrl: OLLAMA_DOWNLOAD_PAGE,
    uvPath,
    setupComplete: setupCompleteFlagExists(),
    askReady,
    gatePassed: currentGatePassed(),
    runtimeBusy: ensureRuntimeBusy,
    missingModels: probe?.missingModels ?? [],
    healthModels: {
      llm: probe?.llm ?? '',
      embedding: probe?.embedding ?? '',
    },
  };
}

async function ensureOllamaServeIfNeeded(): Promise<void> {
  await resolveTools();
  const probe = await refreshProbe();
  if (probe?.ollama) {
    return;
  }
  if (ollamaPath === null) {
    return;
  }
  if (ollamaServeOwned && ollamaServeProcess !== null) {
    return;
  }
  try {
    // macOS: only open the real app. Spawning the bare `ollama` binary puts a
    // blinking black "exec" icon in the Dock for as long as serve runs.
    const ollamaApp = join('/Applications', 'Ollama.app');
    if (process.platform === 'darwin' && existsSync(ollamaApp)) {
      spawnLogged({
        label: 'ollama-open',
        command: 'open',
        args: ['-a', 'Ollama'],
        cwd: app.getPath('userData'),
        env: { ...process.env },
        logPath: join(app.getPath('userData'), 'logs', 'ollama-serve.log'),
      });
      return;
    }
    ollamaServeProcess = spawnLogged({
      label: 'ollama-serve',
      command: ollamaPath,
      args: ['serve'],
      cwd: app.getPath('userData'),
      env: { ...process.env },
      logPath: join(app.getPath('userData'), 'logs', 'ollama-serve.log'),
    });
    ollamaServeOwned = true;
  } catch {
    ollamaServeOwned = false;
    ollamaServeProcess = null;
  }
}

async function waitForOllamaApi(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  emitRuntimeProgress({ stage: 'waiting_for_ollama' });
  while (Date.now() < deadline) {
    await resolveTools();
    await ensureOllamaServeIfNeeded();
    const probe = await refreshProbe();
    if (probe?.ollama) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Timed out waiting for Ollama');
}

async function pullProfileModels(): Promise<void> {
  if (uvPath === null) {
    throw new Error('uv is not available');
  }
  emitRuntimeProgress({ stage: 'pulling_models' });
  const engineDir = resolveEngineDir(repoRoot());
  const profile = recommendation?.profileId ?? 'starter-32gb';
  const child = spawnLogged({
    label: 'pull-models',
    command: uvPath,
    args: ['run', 'python', '-m', 'rag_engine.pull_models', '--profile', profile],
    cwd: engineDir,
    env: {
      ...uvEnv(),
      BGA_MODEL_PROFILE: profile,
      BGA_STORAGE_DIR: dataDir,
    },
    logPath: join(app.getPath('userData'), 'logs', 'pull-models.log'),
  });
  const code = await waitForExit(child.child);
  if (code !== 0) {
    throw new Error(`Model pull exited with code ${code}`);
  }
}

async function waitForAskReady(timeoutMs: number): Promise<void> {
  emitRuntimeProgress({ stage: 'preparing_search' });
  const deadline = Date.now() + timeoutMs;
  let lastReloadAt = 0;
  while (Date.now() < deadline) {
    const probe = await refreshProbe();
    if (probe !== null && liveProbeOk(probe)) {
      return;
    }
    const needsReload =
      probe === null ||
      (!probe.reranker && !probe.retrievalLoading && Date.now() - lastReloadAt > 5_000);
    if (needsReload) {
      lastReloadAt = Date.now();
      try {
        await fetch(`http://127.0.0.1:${enginePort}/retrieval/reload`, {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Keep polling — the engine may still be starting.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Timed out waiting for search to become ready');
}

async function runEnsureRuntime(): Promise<void> {
  if (ensureRuntimeBusy) {
    throw new Error('Runtime setup is already running');
  }
  ensureRuntimeBusy = true;
  try {
    await resolveTools();
    if (ollamaPath === null || !(await refreshProbe())?.ollama) {
      if (ollamaPath === null) {
        emitRuntimeProgress({ stage: 'downloading_installer' });
        const destination = installerDestination(app.getPath('userData'), process.platform);
        await downloadAllowlistedFile({
          url: ollamaInstallerUrl(process.platform),
          destinationPath: destination,
          onProgress: (progress) => {
            emitRuntimeProgress({
              stage: 'downloading_installer',
              receivedBytes: progress.receivedBytes,
              totalBytes: progress.totalBytes ?? undefined,
            });
          },
        });
        const openError = await shell.openPath(destination);
        if (openError) {
          throw new Error(openError);
        }
      }
      await waitForOllamaApi(15 * 60_000);
    }
    await pullProfileModels();
    await waitForAskReady(20 * 60_000);
    writeSetupCompleteFlag();
    await refreshProbe();
    emitRuntimeProgress({ stage: 'ready' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    let code = 'runtime_failed';
    if (message.includes('Timed out waiting for Ollama')) {
      code = 'ollama_timeout';
    } else if (message.includes('Timed out waiting for search')) {
      code = 'search_timeout';
    } else if (message.includes('Model pull')) {
      code = 'pull_failed';
    } else if (
      message.includes('download') ||
      message.includes('Installer') ||
      message.includes('installer redirect') ||
      message.includes('allowlist')
    ) {
      code = 'download_failed';
    }
    emitRuntimeProgress({ stage: 'error', code });
    throw error;
  } finally {
    ensureRuntimeBusy = false;
  }
}

async function startBackend(options: { skipRetrievalWarm: boolean }): Promise<void> {
  pushSplashActivity('checking_computer');
  dataDir = join(app.getPath('userData'), 'storage');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true });

  machine = await readMachineSnapshot(dataDir);
  recommendation = recommendProfile(machine);
  uiLocale = desktopLocale(app.getLocale());

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

  pushSplashActivity('starting_assistant');
  await syncPythonEnvironment(engineDir);

  const profileEnv = recommendation?.profileId ?? 'starter-32gb';
  const engineEnv: NodeJS.ProcessEnv = {
    ...uvEnv(),
    BGA_STORAGE_DIR: dataDir,
    BGA_OLLAMA_URL: process.env.BGA_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    BGA_MODEL_PROFILE: process.env.BGA_MODEL_PROFILE ?? profileEnv,
    ...(options.skipRetrievalWarm ? { BGA_SKIP_RETRIEVAL_WARM: '1' } : {}),
  };

  let engineCommand = uvPath;
  let engineArgList = engineArgs(enginePort);
  if (process.platform === 'darwin') {
    const venvPython = join(pythonEnvDir(), 'bin', 'python');
    engineCommand = ensureMacHiddenCliApp({
      userDataDir: app.getPath('userData'),
      appFileName: 'BGAEngine.app',
      bundleId: 'local.bga.engine-helper',
      bundleName: 'BGA Engine',
      executableName: 'BGAEngine',
      targetBinary: venvPython,
      trampoline: 'exec-script',
    });
    engineArgList = enginePythonArgs(enginePort);
  }

  engineProcess = spawnLogged({
    label: 'engine',
    command: engineCommand,
    args: engineArgList,
    cwd: engineDir,
    env: engineEnv,
    logPath: engineLogPath,
  });

  if (isDev && process.env.BGA_WEB_URL) {
    const url = new URL(process.env.BGA_WEB_URL);
    webPort = Number(url.port || 3000);
    await waitForHttp(`http://127.0.0.1:${webPort}/${uiLocale}`, { timeoutMs: 5_000 });
    await waitForHttp(`http://127.0.0.1:${enginePort}/health`, { timeoutMs: 60_000 });
    await refreshProbe();
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
      command: resolveElectronNodeCommand({
        execPath: process.execPath,
        platform: process.platform,
        packaged: app.isPackaged,
      }),
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
      command: resolveElectronNodeCommand({
        execPath: process.execPath,
        platform: process.platform,
        packaged: app.isPackaged,
      }),
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

  await waitForHttpWhileAlive(`http://127.0.0.1:${enginePort}/health`, engineProcess, {
    timeoutMs: 60_000,
  });
  await refreshProbe();
  const bootActivity = lastProbe === null ? null : splashActivityFromProbe(lastProbe);
  if (bootActivity !== null) {
    pushSplashActivity(bootActivity);
  }
  if (nextProcess === null) {
    throw new Error('Next.js process failed to start');
  }
  await waitForHttpWhileAlive(`http://127.0.0.1:${webPort}/${uiLocale}`, nextProcess, {
    timeoutMs: 60_000,
  });
  await refreshProbe();
  backendsReady = true;
}

function registerIpc(): void {
  ipcMain.handle('desktop:get-setup-state', async () => {
    await refreshProbe();
    return setupState();
  });

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
        `gatePassed=${currentGatePassed()}`,
      ],
    });
    return { path };
  });

  ipcMain.handle('desktop:mark-setup-complete', async () => {
    await refreshProbe();
    if (lastProbe === null || !liveProbeOk(lastProbe)) {
      throw new Error('Setup is not complete until Ollama and search are ready');
    }
    writeSetupCompleteFlag();
    return setupState();
  });

  ipcMain.handle('desktop:open-external-https', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('Only https URLs can be opened');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('desktop:ensure-runtime', async () => {
    await runEnsureRuntime();
    await refreshProbe();
    return { ok: true as const };
  });

  ipcMain.handle('desktop:pull-models', async () => {
    await pullProfileModels();
    return { ok: true as const };
  });
}

function installNavigationLock(window: BrowserWindow): void {
  if (windowsWithNavigationLock.has(window)) {
    return;
  }
  windowsWithNavigationLock.add(window);
  const setupPrefix = `http://127.0.0.1:${webPort}/${uiLocale}/setup`;
  window.webContents.on('will-navigate', (event, url) => {
    if (currentGatePassed()) {
      return;
    }
    if (!url.startsWith(setupPrefix)) {
      event.preventDefault();
      void window.loadURL(setupPrefix);
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function i18nLocalesDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'i18n');
  }
  return join(repoRoot(), 'apps/web/src/i18n/locales');
}

function createWindow(): Promise<void> {
  if (mainWindow !== null) {
    mainWindow.show();
    return Promise.resolve();
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const copy = readStartupCopy(i18nLocalesDir(), uiLocale);
  const html = buildSplashHtml({
    copy,
    dark: nativeTheme.shouldUseDarkColors,
    locale: uiLocale,
  });
  const shown = new Promise<void>((resolve) => {
    mainWindow?.once('ready-to-show', () => {
      mainWindow?.show();
      resolve();
    });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.once('did-finish-load', () => {
    writeSplashActivity(pendingSplashActivity);
  });
  void mainWindow.loadURL(splashDataUrl(html));
  return shown;
}

async function loadAppPage(): Promise<void> {
  if (mainWindow === null) {
    await createWindow();
  }
  const window = mainWindow;
  if (window === null) {
    throw new Error('Main window failed to open');
  }
  const path = initialAppPath({ locale: uiLocale, gatePassed: currentGatePassed() });
  installNavigationLock(window);
  await window.loadURL(`http://127.0.0.1:${webPort}${path}`);
}

function installMicPermissionHandler(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
}

function shutdown(): void {
  stopManaged(nextProcess);
  stopManaged(engineProcess);
  if (ollamaServeOwned) {
    stopManaged(ollamaServeProcess);
  }
  nextProcess = null;
  engineProcess = null;
  ollamaServeProcess = null;
  ollamaServeOwned = false;
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
    uiLocale = desktopLocale(app.getLocale());
    const splashShown = createWindow();

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
        await refreshProbe();
        backendsReady = true;
      } else {
        // First consent is the Install button. After that (flag set, or Ollama
        // already on the machine from a prior install) start runtime alone and
        // open the assistant — never make the player re-tap Install.
        await resolveTools();
        const returningPlayer = setupCompleteFlagExists() || ollamaPath !== null;
        for (const action of desktopLaunchActions({ returningPlayer })) {
          switch (action.type) {
            case 'startBackend':
              await startBackend({ skipRetrievalWarm: action.skipRetrievalWarm });
              break;
            case 'loadAppPage':
              await splashShown;
              await loadAppPage();
              break;
            case 'ensureRuntime':
              try {
                await runEnsureRuntime();
              } catch {
                await resolveTools();
                if (ollamaPath === null) {
                  clearSetupCompleteFlag();
                }
              }
              break;
          }
        }
        backendsReady = true;
      }
      if (isDev && process.env.BGA_WEB_URL) {
        await splashShown;
        await loadAppPage();
      }
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
      void createWindow().then(() => {
        if (backendsReady) {
          return loadAppPage();
        }
        return undefined;
      });
    }
  });
}
