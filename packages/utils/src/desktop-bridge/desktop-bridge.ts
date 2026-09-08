/** Absent in a normal browser — only present when Electron preload injects it. */

export type ModelProfileId = 'minimal-16gb' | 'starter-32gb' | 'full-64gb';

export interface DesktopMachineSnapshot {
  platform: 'darwin' | 'win32' | 'linux';
  totalMemoryGiB: number;
  gpuMemoryGiB: number | null;
  freeDiskGiB: number;
  appleSilicon: boolean;
}

export interface DesktopProfileRecommendation {
  profileId: ModelProfileId;
  approxDiskGiB: number;
  reason: 'full' | 'starter' | 'minimal' | 'insufficient_disk' | 'insufficient_memory';
}

export type RuntimeProgress =
  | { stage: 'downloading_installer'; receivedBytes?: number; totalBytes?: number }
  | { stage: 'waiting_for_ollama' }
  | { stage: 'pulling_models' }
  | { stage: 'preparing_search' }
  | { stage: 'ready' }
  | { stage: 'error'; code: string };

export interface HealthModels {
  llm: string;
  embedding: string;
}

export interface DiagnosticsSaveResult {
  path: string;
}

export interface OkResult {
  ok: true;
}

export interface DesktopSetupState {
  machine: DesktopMachineSnapshot | null;
  recommendation: DesktopProfileRecommendation | null;
  ollamaPath: string | null;
  ollamaDownloadUrl: string;
  uvPath: string | null;
  setupComplete: boolean;
  /** Live Ask-ready probe (enables Continue). Does not require the stored flag. */
  askReady: boolean;
  /** Stored flag + Ask-ready — used for navigation off /setup. */
  gatePassed: boolean;
  missingModels: string[];
  healthModels: HealthModels;
}

export interface BgaDesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<DiagnosticsSaveResult>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  ensureRuntime: () => Promise<OkResult>;
  onRuntimeProgress: (handler: (event: RuntimeProgress) => void) => () => void;
  openExternalHttps: (url: string) => Promise<void>;
  pullModels: () => Promise<OkResult>;
}

declare global {
  interface Window {
    bgaDesktop?: BgaDesktopApi;
  }
}

export const getDesktopApi = (): BgaDesktopApi | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.bgaDesktop ?? null;
};

/** Fired after a successful PDF import so the game list can refetch. */
export const GAMES_CHANGED_EVENT = 'bga:games-changed';
