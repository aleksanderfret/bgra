import { describe, expect, it } from 'vitest';
import { localeFromPathname, prefixLocale, withLocale } from './routing';

describe('localeFromPathname', () => {
  it('reads the locale out of the first segment', () => {
    expect(localeFromPathname('/pl')).toBe('pl');
    expect(localeFromPathname('/en/games/azul')).toBe('en');
  });

  it('returns null for a path that merely starts with the same letters', () => {
    expect(localeFromPathname('/please')).toBeNull();
    expect(localeFromPathname('/engine')).toBeNull();
  });

  it('returns null for the bare root and for an unknown locale', () => {
    expect(localeFromPathname('/')).toBeNull();
    expect(localeFromPathname('/de/games')).toBeNull();
  });
});

describe('withLocale', () => {
  it('swaps the locale and keeps the rest of the path', () => {
    expect(withLocale('/pl/games/azul', 'en')).toBe('/en/games/azul');
    expect(withLocale('/pl', 'en')).toBe('/en');
  });
});

describe('prefixLocale', () => {
  it('does not leave a trailing slash on the root', () => {
    expect(prefixLocale('/', 'pl')).toBe('/pl');
  });

  it('keeps the original path underneath the locale', () => {
    expect(prefixLocale('/games/azul', 'en')).toBe('/en/games/azul');
  });
});
