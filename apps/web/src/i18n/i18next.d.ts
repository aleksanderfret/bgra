import type common from './locales/en/common.json';

/**
 * Types every `t()` call against the English catalogue.
 *
 * English is the reference side because the repository is written in English
 * (see `AGENTS.md`). A key that exists only in Polish is therefore a compile
 * error at the call site, and `locales.test.ts` catches the reverse.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: typeof common };
    // i18next reads `_` as the plural and context marker, which would make
    // `player_aid` a plural of `player`. The engine's codes are snake_case and
    // are not ours to rename, so the markers move out of their way instead.
    // `instance.ts` must set the same two values at runtime.
    pluralSeparator: '--';
    contextSeparator: '--';
  }
}
