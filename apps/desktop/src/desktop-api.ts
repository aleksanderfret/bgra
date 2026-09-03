import type { MachineSnapshot, ProfileRecommendation } from './capabilities';

export interface DesktopSetupState {
  machine: MachineSnapshot | null;
  recommendation: ProfileRecommendation | null;
  ollamaPath: string | null;
  ollamaDownloadUrl: string;
  uvPath: string | null;
  setupComplete: boolean;
}

export interface DesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<{ path: string }>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  pullModels: () => Promise<{ ok: true }>;
}

declare global {
  interface Window {
    bgaDesktop?: DesktopApi;
  }
}
