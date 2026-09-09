import { describe, expect, it } from 'vitest';
import { defaultUninstallSelection, parseUninstallSelection } from './selection';

describe('defaultUninstallSelection', () => {
  it('defaults every optional checkbox to false', () => {
    expect(defaultUninstallSelection()).toEqual({
      removeData: false,
      removeApplication: false,
      removeLlmModels: false,
      removeOllama: false,
    });
  });
});

describe('parseUninstallSelection', () => {
  it('accepts a full selection object', () => {
    expect(
      parseUninstallSelection({
        removeData: true,
        removeApplication: false,
        removeLlmModels: true,
        removeOllama: false,
      }),
    ).toEqual({
      removeData: true,
      removeApplication: false,
      removeLlmModels: true,
      removeOllama: false,
    });
  });

  it('rejects non-objects and non-booleans', () => {
    expect(parseUninstallSelection(null)).toBeNull();
    expect(parseUninstallSelection({ removeData: 1 })).toBeNull();
    expect(
      parseUninstallSelection({
        removeData: true,
        removeApplication: true,
        removeLlmModels: true,
      }),
    ).toBeNull();
  });
});
