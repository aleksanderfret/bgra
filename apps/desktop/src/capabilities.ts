export type ModelProfileId = 'minimal-16gb' | 'starter-32gb' | 'full-64gb';

export interface MachineSnapshot {
  platform: 'darwin' | 'win32' | 'linux';
  /** Total system RAM in gibibytes. On Apple Silicon this is unified memory. */
  totalMemoryGiB: number;
  /** Dedicated GPU memory in gibibytes. Meaningful on Windows/Linux; null on macOS. */
  gpuMemoryGiB: number | null;
  freeDiskGiB: number;
  appleSilicon: boolean;
}

export interface ProfileRecommendation {
  profileId: ModelProfileId;
  /** Disk the profile expects after models are downloaded. */
  approxDiskGiB: number;
  reason: 'full' | 'starter' | 'minimal' | 'insufficient_disk' | 'insufficient_memory';
}

const PROFILE_DISK_GIB: Record<ModelProfileId, number> = {
  'minimal-16gb': 6,
  'starter-32gb': 12,
  'full-64gb': 48,
};

/**
 * Map a machine snapshot to a model profile. Pure: no filesystem or OS calls.
 *
 * On macOS, unified memory is the budget. On Windows/Linux, dedicated GPU
 * memory (when present) is preferred over system RAM for the LLM.
 */
export function recommendProfile(machine: MachineSnapshot): ProfileRecommendation {
  const memoryBudgetGiB =
    machine.platform === 'darwin'
      ? machine.totalMemoryGiB
      : (machine.gpuMemoryGiB ?? machine.totalMemoryGiB);

  let profileId: ModelProfileId;
  let reason: ProfileRecommendation['reason'];

  // Discrete GPUs often ship with 8–12 GB; unified-memory Macs start at 16 GB.
  // Thresholds are therefore slightly lower than the profile label numbers.
  if (memoryBudgetGiB >= 60) {
    profileId = 'full-64gb';
    reason = 'full';
  } else if (memoryBudgetGiB >= 28) {
    profileId = 'starter-32gb';
    reason = 'starter';
  } else if (memoryBudgetGiB >= 10) {
    profileId = 'minimal-16gb';
    reason = 'minimal';
  } else {
    return {
      profileId: 'minimal-16gb',
      approxDiskGiB: PROFILE_DISK_GIB['minimal-16gb'],
      reason: 'insufficient_memory',
    };
  }

  const approxDiskGiB = PROFILE_DISK_GIB[profileId];
  if (machine.freeDiskGiB < approxDiskGiB + 2) {
    return {
      profileId,
      approxDiskGiB,
      reason: 'insufficient_disk',
    };
  }

  return { profileId, approxDiskGiB, reason };
}
