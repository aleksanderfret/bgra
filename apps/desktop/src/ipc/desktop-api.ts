import type { HealthProbe } from '../setup/gate';
import type { MachineSnapshot, ProfileRecommendation } from '../system/capabilities';

export type RuntimeProgress =
  | { stage: 'downloading_installer'; receivedBytes?: number; totalBytes?: number }
  | { stage: 'waiting_for_ollama' }
  | { stage: 'pulling_models' }
  | { stage: 'preparing_search' }
  | { stage: 'ready' }
  | { stage: 'error'; code: string };

export interface DesktopSetupState {
  machine: MachineSnapshot | null;
  recommendation: ProfileRecommendation | null;
  ollamaPath: string | null;
  ollamaDownloadUrl: string;
  uvPath: string | null;
  setupComplete: boolean;
  /** Live Ask-ready probe (enables Continue). Does not require the stored flag. */
  askReady: boolean;
  /** Stored flag + Ask-ready — used for navigation off /setup. */
  gatePassed: boolean;
  missingModels: string[];
  healthModels: { llm: string; embedding: string };
}

export interface DesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<{ path: string }>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  ensureRuntime: () => Promise<{ ok: true }>;
  onRuntimeProgress: (handler: (event: RuntimeProgress) => void) => () => void;
  openExternalHttps: (url: string) => Promise<void>;
  pullModels: () => Promise<{ ok: true }>;
}

declare global {
  interface Window {
    bgaDesktop?: DesktopApi;
  }
}

export type { HealthProbe };
