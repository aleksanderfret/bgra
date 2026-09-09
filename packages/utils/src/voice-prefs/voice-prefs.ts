/** Persist the player's "read aloud" preference (default off). */

export const READ_ALOUD_STORAGE_KEY = 'bga.voice.readAloud.v1';

export const loadReadAloudPreference = (): boolean => {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(READ_ALOUD_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const saveReadAloudPreference = (enabled: boolean): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(READ_ALOUD_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Quota / private mode — preference stays in-memory only.
  }
};
