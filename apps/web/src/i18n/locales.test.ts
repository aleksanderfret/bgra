import { describe, expect, it } from 'vitest';
import { resources } from './resources';
import { LOCALES } from './settings';

/** Every leaf key, dot-joined, sorted — the shape of a catalogue. */
function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value)
    .flatMap(([key, child]) => keysOf(child, prefix === '' ? key : `${prefix}.${key}`))
    .sort();
}

function placeholdersOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

function entriesOf(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[prefix, value]];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    entriesOf(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

const reference = resources.en.common;

describe('translation catalogues', () => {
  it.each(LOCALES)('%s defines exactly the keys English defines', (locale) => {
    // A missing key would silently render the key path on screen, and an extra
    // one is dead weight that never gets deleted.
    expect(keysOf(resources[locale].common)).toEqual(keysOf(reference));
  });

  it.each(LOCALES)('%s leaves no value blank', (locale) => {
    const blank = entriesOf(resources[locale].common)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(blank).toEqual([]);
  });

  it.each(LOCALES)('%s interpolates the same values as English', (locale) => {
    // A dropped `{{gameId}}` produces a sentence that reads fine and names the
    // wrong thing, which is the kind of bug nobody reports.
    const referencePlaceholders = new Map(
      entriesOf(reference).map(([key, value]) => [key, placeholdersOf(value)]),
    );

    for (const [key, value] of entriesOf(resources[locale].common)) {
      expect(placeholdersOf(value), key).toEqual(referencePlaceholders.get(key));
    }
  });
});
