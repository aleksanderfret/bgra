import en from '@bga-web-i18n/locales/en/common.json';
import pl from '@bga-web-i18n/locales/pl/common.json';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { ActivityProgress } from './ActivityProgress';

describe('ActivityProgress', () => {
  it('announces an indeterminate wait as a live status', () => {
    render(
      <ActivityProgress layout="page" view={{ activity: 'checking_computer', percent: null }} />,
      'en',
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(en.activity.checking_computer);
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('exposes a real percent as a progressbar', () => {
    render(
      <ActivityProgress
        layout="inline"
        view={{ activity: 'drawing', percent: 58, current: 4, total: 10 }}
      />,
      'en',
    );

    const bar = screen.getByRole('progressbar', { name: en.activity.drawing });
    expect(bar).toHaveAttribute('aria-valuenow', '58');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveTextContent(en.activity.drawing);
    expect(bar).toHaveTextContent(en.activity.detail.replace('{{percent}}', '58'));
    expect(bar).not.toHaveTextContent('4 of 10');
  });

  it('uses the unknown line when no activity code is set', () => {
    render(<ActivityProgress layout="page" view={{ activity: null, percent: null }} />, 'pl');

    expect(screen.getByRole('status')).toHaveTextContent(pl.activity.unknown);
  });

  it('puts page copy below the ring by default', () => {
    render(
      <ActivityProgress layout="page" view={{ activity: 'checking_computer', percent: null }} />,
      'en',
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-message-placement', 'below');
  });

  it('puts inline copy beside the ring by default', () => {
    render(<ActivityProgress layout="inline" view={{ activity: 'drawing', percent: 10 }} />, 'en');

    expect(screen.getByRole('progressbar')).toHaveAttribute('data-message-placement', 'beside');
  });

  it('honours an explicit messagePlacement override', () => {
    render(
      <ActivityProgress
        layout="page"
        messagePlacement="beside"
        view={{ activity: 'checking_computer', percent: null }}
      />,
      'en',
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-message-placement', 'beside');
  });
});
