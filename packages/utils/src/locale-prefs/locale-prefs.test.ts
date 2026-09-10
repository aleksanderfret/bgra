import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  loadLocalePreference,
  parseLocalePreference,
  saveLocalePreference,
} from './locale-prefs';

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

describe('parseLocalePreference', () => {
  it('accepts known locales and rejects everything else', () => {
    expect(parseLocalePreference('pl')).toBe('pl');
    expect(parseLocalePreference('en')).toBe('en');
    expect(parseLocalePreference('de')).toBeNull();
    expect(parseLocalePreference(null)).toBeNull();
    expect(parseLocalePreference(undefined)).toBeNull();
  });
});

describe('locale prefs', () => {
  it('returns null when storage is missing', () => {
    expect(loadLocalePreference()).toBeNull();
  });

  it('round-trips through localStorage and sets the cookie', () => {
    stubStorage();
    const cookieCalls: string[] = [];
    vi.stubGlobal('document', {
      get cookie() {
        return '';
      },
      set cookie(value: string) {
        cookieCalls.push(value);
      },
    });

    saveLocalePreference('en');
    expect(memory.get(LOCALE_STORAGE_KEY)).toBe('en');
    expect(loadLocalePreference()).toBe('en');
    expect(cookieCalls[0]).toContain(`${LOCALE_COOKIE_NAME}=en`);
    expect(cookieCalls[0]).toContain('path=/');

    saveLocalePreference('pl');
    expect(loadLocalePreference()).toBe('pl');
  });
});
