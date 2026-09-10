import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { DesktopWindowInset } from './DesktopWindowInset';

describe('DesktopWindowInset', () => {
  it('renders children without an inset outside Electron', () => {
    render(
      <DesktopWindowInset>
        <p>content</p>
      </DesktopWindowInset>,
      'en',
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
