export const COLOR_SCHEMES = ['light', 'dark', 'auto'] as const;

export type ColorSchemePreference = (typeof COLOR_SCHEMES)[number];

export const isColorScheme = (value: string): value is ColorSchemePreference =>
  COLOR_SCHEMES.some((scheme) => scheme === value);
