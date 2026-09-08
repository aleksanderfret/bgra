import en from '@bga-web-i18n/locales/en/common.json';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { DiagnosticsButton } from './DiagnosticsButton';

describe('DiagnosticsButton', () => {
  it('renders nothing when the desktop bridge is absent', () => {
    Reflect.deleteProperty(window, 'bgaDesktop');
    render(<DiagnosticsButton />, 'en');
    expect(
      screen.queryByRole('button', { name: en.setup.diagnostics.save }),
    ).not.toBeInTheDocument();
  });
});
