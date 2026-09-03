import type { MachineSnapshot, ProfileRecommendation } from './capabilities';

export interface DesktopSetupState {
  machine: MachineSnapshot | null;
  recommendation: ProfileRecommendation | null;
  ollamaPath: string | null;
  ollamaDownloadUrl: string;
  uvPath: string | null;
  setupComplete: boolean;
  ingestAvailable: boolean;
}

export interface DesktopApi {
  getSetupState: () => Promise<DesktopSetupState>;
  saveDiagnostics: () => Promise<{ path: string }>;
  markSetupComplete: () => Promise<DesktopSetupState>;
  pullModels: () => Promise<{ ok: true }>;
  /** Stage 2 is not implemented yet; always returns a deferred result. */
  importPdf: (payload: {
    filePath: string;
    gameId: string;
  }) => Promise<{ ok: false; reason: 'ingest_not_ready' | 'invalid_game_id' }>;
}

declare global {
  interface Window {
    bgaDesktop?: DesktopApi;
  }
}
