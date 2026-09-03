/** Types for the optional Electron preload bridge. Absent in a normal browser. */

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

export interface DesktopSetupState {
  machine: DesktopMachineSnapshot | null;
  recommendation: DesktopProfileRecommendation | null;
  ollamaPath: string | null;
  ollamaDownloadUrl: string;
  uvPath: string | null;
  setupComplete: boolean;
  ingestAvailable: boolean;
}

export interface BgaDesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<{ path: string }>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  pullModels: () => Promise<{ ok: true }>;
  importPdf: (payload: {
    filePath: string;
    gameId: string;
  }) => Promise<{ ok: false; reason: 'ingest_not_ready' | 'invalid_game_id' }>;
}

declare global {
  interface Window {
    bgaDesktop?: BgaDesktopApi;
  }
}

export function getDesktopApi(): BgaDesktopApi | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.bgaDesktop ?? null;
}
