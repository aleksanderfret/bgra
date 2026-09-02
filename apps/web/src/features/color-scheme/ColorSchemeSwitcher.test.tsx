import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import { render, screen, userEvent } from '@/test-utils';
import { ColorSchemeSwitcher } from './ColorSchemeSwitcher';

describe('ColorSchemeSwitcher', () => {
  it('names the radiogroup with the visible translated label', () => {
    render(<ColorSchemeSwitcher />, 'en');

    expect(screen.getByRole('radiogroup', { name: en.colorScheme.label })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.colorScheme.light })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.colorScheme.dark })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.colorScheme.auto })).toBeInTheDocument();
  });

  it('starts on auto, the same default as ColorSchemeScript', () => {
    render(<ColorSchemeSwitcher />, 'en');

    expect(screen.getByRole('radio', { name: en.colorScheme.auto })).toBeChecked();
  });

  it('keeps the chosen scheme after the user picks one', async () => {
    render(<ColorSchemeSwitcher />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.colorScheme.dark }));

    expect(screen.getByRole('radio', { name: en.colorScheme.dark })).toBeChecked();
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
    expect(screen.getByRole('status')).toHaveTextContent(
      en.colorScheme.changed.replace('{{scheme}}', en.colorScheme.dark),
    );
  });

  it('moves between options with the arrow keys', async () => {
    render(<ColorSchemeSwitcher />, 'en');

    await userEvent.click(screen.getByRole('radio', { name: en.colorScheme.auto }));
    await userEvent.keyboard('{ArrowLeft}');

    expect(screen.getByRole('radio', { name: en.colorScheme.dark })).toBeChecked();
  });
});
