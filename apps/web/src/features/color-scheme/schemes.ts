import type { MantineColorScheme } from '@mantine/core';

export const COLOR_SCHEMES = [
  'light',
  'dark',
  'auto',
] as const satisfies readonly MantineColorScheme[];

export type ColorSchemePreference = (typeof COLOR_SCHEMES)[number];

export function isColorScheme(value: string): value is ColorSchemePreference {
  return (COLOR_SCHEMES as readonly string[]).includes(value);
}
