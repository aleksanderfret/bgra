import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MachineSnapshot, ProfileRecommendation } from './capabilities';

export interface DiagnosticsPayload {
  createdAt: string;
  profile: ProfileRecommendation | null;
  machine: MachineSnapshot | null;
  engineLogPath: string | null;
  nextLogPath: string | null;
  notes: string[];
}

export function writeDiagnosticsFile(dataDir: string, payload: DiagnosticsPayload): string {
  mkdirSync(dataDir, { recursive: true });
  const target = join(dataDir, `diagnostics-${Date.now()}.json`);
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}
