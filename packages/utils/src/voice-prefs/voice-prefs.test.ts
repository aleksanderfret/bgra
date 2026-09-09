import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadReadAloudPreference,
  READ_ALOUD_STORAGE_KEY,
  saveReadAloudPreference,
} from './voice-prefs';

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
});

const stubStorage = (): void => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    clear: () => {
      memory.clear();
    },
  });
};

describe('voice prefs', () => {
  it('defaults to off when storage is missing', () => {
    expect(loadReadAloudPreference()).toBe(false);
  });

  it('round-trips through localStorage', () => {
    stubStorage();
    saveReadAloudPreference(true);
    expect(memory.get(READ_ALOUD_STORAGE_KEY)).toBe('true');
    expect(loadReadAloudPreference()).toBe(true);
    saveReadAloudPreference(false);
    expect(loadReadAloudPreference()).toBe(false);
  });
});
