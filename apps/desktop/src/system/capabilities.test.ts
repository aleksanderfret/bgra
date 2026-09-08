import { describe, expect, it } from 'vitest';
import { type MachineSnapshot, recommendProfile } from './capabilities';

const baseMac: MachineSnapshot = {
  platform: 'darwin',
  totalMemoryGiB: 32,
  gpuMemoryGiB: null,
  freeDiskGiB: 100,
  appleSilicon: true,
};

describe('recommendProfile', () => {
  it('picks full-64gb on a high-memory Mac with enough disk', () => {
    expect(recommendProfile({ ...baseMac, totalMemoryGiB: 64 }).profileId).toBe('full-64gb');
  });

  it('picks starter-32gb on a typical Pro Mac', () => {
    expect(recommendProfile(baseMac).profileId).toBe('starter-32gb');
  });

  it('picks minimal-16gb on a 16 GB Mac', () => {
    expect(recommendProfile({ ...baseMac, totalMemoryGiB: 16 }).profileId).toBe('minimal-16gb');
  });

  it('flags insufficient memory below 10 GB', () => {
    const result = recommendProfile({ ...baseMac, totalMemoryGiB: 8 });
    expect(result.profileId).toBe('minimal-16gb');
    expect(result.reason).toBe('insufficient_memory');
  });

  it('flags insufficient disk even when memory is fine', () => {
    const result = recommendProfile({ ...baseMac, freeDiskGiB: 5 });
    expect(result.reason).toBe('insufficient_disk');
  });

  it('uses GPU memory on Windows rather than system RAM', () => {
    const result = recommendProfile({
      platform: 'win32',
      totalMemoryGiB: 16,
      gpuMemoryGiB: 12,
      freeDiskGiB: 100,
      appleSilicon: false,
    });
    expect(result.profileId).toBe('minimal-16gb');
    expect(result.reason).toBe('minimal');
  });

  it('treats 24 GB VRAM on Windows as minimal (below starter cut-off)', () => {
    const result = recommendProfile({
      platform: 'win32',
      totalMemoryGiB: 32,
      gpuMemoryGiB: 24,
      freeDiskGiB: 100,
      appleSilicon: false,
    });
    expect(result.profileId).toBe('minimal-16gb');
  });

  it('treats 32 GB VRAM on Windows as starter', () => {
    const result = recommendProfile({
      platform: 'win32',
      totalMemoryGiB: 64,
      gpuMemoryGiB: 32,
      freeDiskGiB: 100,
      appleSilicon: false,
    });
    expect(result.profileId).toBe('starter-32gb');
  });
});
