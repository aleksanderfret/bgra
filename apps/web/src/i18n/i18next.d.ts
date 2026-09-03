import type common from './locales/en/common.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: typeof common };
    // i18next reads `_` as the plural marker, so `player_aid` would be a
    // plural of `player`. Must match `instance.ts`.
    pluralSeparator: '--';
    contextSeparator: '--';
  }
}
