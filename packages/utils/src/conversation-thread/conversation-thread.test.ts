import { initialAnswerState, startAnswer } from '@bga/utils/answer-state';
import { describe, expect, it } from 'vitest';
import {
  appendExchange,
  dropExchange,
  emptyThread,
  parseThread,
  replaceExchangeAnswer,
  selectExchanges,
  serializeThread,
  type ThreadExchange,
} from './conversation-thread';

const exchange = (id: string, question: string): ThreadExchange => ({
  id,
  askedAt: '2026-09-09T10:00:00.000Z',
  question,
  mode: 'arbitrate',
  expansionIds: [],
  answer: { ...initialAnswerState, text: `answer for ${question}` },
});

describe('conversation-thread', () => {
  it('returns an empty thread for a game', () => {
    expect(emptyThread('azul')).toEqual({
      version: 1,
      gameId: 'azul',
      exchanges: [],
    });
  });

  it('appends a player/assistant pair without dropping earlier ones', () => {
    const first = appendExchange(emptyThread('azul'), exchange('a', 'How do I score?'));
    const second = appendExchange(first, exchange('b', 'And the end of the game?'));

    expect(second.exchanges.map((item) => item.question)).toEqual([
      'How do I score?',
      'And the end of the game?',
    ]);
  });

  it('replaces only the named exchange answer', () => {
    const thread = appendExchange(emptyThread('azul'), exchange('a', 'Q1'));
    const next = replaceExchangeAnswer(thread, 'a', {
      ...initialAnswerState,
      text: 'Four tiles.',
    });

    expect(next.exchanges[0]?.answer.text).toBe('Four tiles.');
  });

  it('drops an in-flight exchange so Cancel does not leave a hole', () => {
    const thread = appendExchange(emptyThread('azul'), exchange('a', 'Q1'));
    expect(dropExchange(thread, 'a').exchanges).toEqual([]);
  });

  it('shows every exchange on screen and none to the model or archive', () => {
    const thread = appendExchange(emptyThread('azul'), exchange('a', 'Q1'));

    expect(selectExchanges(thread, 'screen')).toEqual(thread.exchanges);
    expect(selectExchanges(thread, 'prompt')).toEqual([]);
    expect(selectExchanges(thread, 'archive')).toEqual([]);
  });

  it('round-trips a valid thread and rejects the wrong game or junk', () => {
    const thread = appendExchange(emptyThread('azul'), exchange('a', 'Q1'));
    const raw: unknown = JSON.parse(serializeThread(thread));

    expect(parseThread(raw, 'azul').exchanges).toHaveLength(1);
    expect(parseThread(raw, 'wingspan').exchanges).toHaveLength(0);
    expect(parseThread('nope', 'azul').exchanges).toHaveLength(0);
  });

  it('keeps valid exchanges when one item in the list is corrupt', () => {
    const thread = appendExchange(emptyThread('azul'), exchange('a', 'Q1'));
    const raw: unknown = JSON.parse(serializeThread(thread));
    if (typeof raw !== 'object' || raw === null || !('exchanges' in raw)) {
      throw new Error('expected a thread envelope');
    }
    const envelope = raw;
    if (!Array.isArray(envelope.exchanges)) {
      throw new Error('expected exchanges');
    }
    envelope.exchanges.push(null);

    expect(parseThread(envelope, 'azul').exchanges).toHaveLength(1);
  });

  it('freezes a streaming answer so a reload cannot leave a stuck spinner', () => {
    const frozen = replaceExchangeAnswer(
      appendExchange(emptyThread('azul'), exchange('a', 'Q1')),
      'a',
      startAnswer(),
    );
    const parsed = parseThread(JSON.parse(serializeThread(frozen)), 'azul');

    expect(parsed.exchanges[0]?.answer.isStreaming).toBe(false);
    expect(parsed.exchanges[0]?.answer.stage).toBe('idle');
  });
});
