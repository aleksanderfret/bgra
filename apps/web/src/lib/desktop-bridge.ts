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
}

export interface BgaDesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<{ path: string }>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  pullModels: () => Promise<{ ok: true }>;
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

/** Fired after a successful PDF import so the game list can refetch. */
export const GAMES_CHANGED_EVENT = 'bga:games-changed';
