import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n/resources';
import { LOCALES } from '@/i18n/settings';
import { ERROR_CODES, NOTICE_CODES } from './codes';

describe.each(LOCALES)('%s catalogue', (locale) => {
  const catalogue = resources[locale].common;

  it('has wording for every error code the engine can send', () => {
    expect(Object.keys(catalogue.answer.error)).toEqual(expect.arrayContaining([...ERROR_CODES]));
  });

  it('has wording for every notice code the engine can send', () => {
    expect(Object.keys(catalogue.notice)).toEqual(expect.arrayContaining([...NOTICE_CODES]));
  });

  it('has a fallback for a code it has never heard of', () => {
    expect(catalogue.answer.error.unknown).toBeTruthy();
    expect(catalogue.notice.unknown).toBeTruthy();
  });
});
