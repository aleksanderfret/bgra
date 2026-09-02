import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import pl from '@/i18n/locales/pl/common.json';
import { render, screen, waitFor } from '@/test-utils';
import { RulesChat } from './RulesChat';

/** The engine being down is the default state on a fresh checkout. */
function withEngineOffline(): void {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RulesChat', () => {
  it('explains how to start the engine when it is unreachable', async () => {
    withEngineOffline();

    render(<RulesChat />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(pl.rulesChat.engineOffline.title);
  });

  it('renders the command in the offline alert as markup, not as literal tags', async () => {
    // `<Trans>` silently prints its own placeholder tags when the `components`
    // map does not name them, which looks like broken copy rather than a bug.
    withEngineOffline();

    const { container } = render(<RulesChat />);

    await screen.findByRole('alert');

    expect(container.querySelector('code')).toHaveTextContent('pnpm dev');
    expect(container.textContent).not.toContain('<command>');
  });

  it('labels every control in the requested language', async () => {
    withEngineOffline();

    render(<RulesChat />, 'en');

    await waitFor(() => {
      expect(screen.getByLabelText(en.rulesChat.question.label)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: en.rulesChat.submit })).toBeInTheDocument();
    expect(screen.getByText(en.rulesChat.mode.teach)).toBeInTheDocument();
    expect(screen.getByText(en.rulesChat.game.description)).toBeInTheDocument();
  });
});
