import { initialAnswerState } from '@bga/utils/answer-state';
import type { ThreadExchange } from '@bga/utils/conversation-thread';
import en from '@bga-web-i18n/locales/en/common.json';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { ConversationLog } from './ConversationLog';

const turn = (id: string, question: string, text: string): ThreadExchange => ({
  id,
  askedAt: '2026-09-09T10:00:00.000Z',
  question,
  mode: 'arbitrate',
  expansionIds: [],
  answer: { ...initialAnswerState, text },
});

describe('ConversationLog', () => {
  it('keeps the first question and answer visible when a second pair arrives', () => {
    render(
      <ConversationLog
        exchanges={[
          turn('a', 'How do I score?', 'Four tiles.'),
          turn('b', 'When does the game end?', 'After the last tile.'),
        ]}
      />,
      'en',
    );

    expect(screen.getByRole('log', { name: en.rulesChat.thread.regionLabel })).toBeInTheDocument();
    expect(screen.getByText('How do I score?')).toBeInTheDocument();
    expect(screen.getByText('Four tiles.')).toBeInTheDocument();
    expect(screen.getByText('When does the game end?')).toBeInTheDocument();
    expect(screen.getByText('After the last tile.')).toBeInTheDocument();
    expect(screen.getAllByText(en.rulesChat.thread.playerLabel)).toHaveLength(2);
  });

  it('renders nothing when the thread is empty', () => {
    render(<ConversationLog exchanges={[]} />, 'en');

    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
});
