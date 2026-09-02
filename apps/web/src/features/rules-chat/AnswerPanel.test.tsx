import type { AssistantEvent, RetrievedSource } from '@bga/api-contract';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/common.json';
import pl from '@/i18n/locales/pl/common.json';
import { render, screen } from '@/test-utils';
import { AnswerPanel } from './AnswerPanel';
import {
  type AnswerState,
  initialAnswerState,
  reduceAssistantEvent,
  startAnswer,
} from './answer-state';

const figureSource: RetrievedSource = {
  id: 'azul:rulebook:p04:c02',
  gameId: 'azul',
  documentTitle: 'Azul — instrukcja',
  documentKind: 'rulebook',
  page: 4,
  score: 0.9,
  excerpt: 'Przygotowanie gry: talerzyki układasz wokół...',
  imageUrl: '/api/engine/static/azul/p04.png',
};

const stateWith = (overrides: Partial<AnswerState>): AnswerState => ({
  ...initialAnswerState,
  ...overrides,
});

describe('AnswerPanel', () => {
  it('renders the streamed answer text', () => {
    render(<AnswerPanel state={stateWith({ text: 'Dobierasz cztery kafelki.' })} />);

    expect(screen.getByText('Dobierasz cztery kafelki.')).toBeInTheDocument();
  });

  it('warns when the answer has no basis in the indexed documents', () => {
    render(<AnswerPanel state={stateWith({ groundedness: 'insufficient_evidence' })} />);

    expect(screen.getByRole('alert')).toHaveTextContent(pl.answer.insufficientEvidence.title);
  });

  it('shows the transcript so a mishearing is visible', () => {
    render(<AnswerPanel state={stateWith({ transcript: 'ile kafelków dobieram' })} />);

    expect(screen.getByText(/ile kafelków dobieram/)).toBeInTheDocument();
  });

  it('renders a figure that came back with the retrieved sources', () => {
    const events: AssistantEvent[] = [
      { type: 'sources', sources: [figureSource] },
      { type: 'figure', sourceId: figureSource.id },
    ];

    const state = events.reduce(reduceAssistantEvent, startAnswer());

    render(<AnswerPanel state={state} />);

    const figureName = pl.answer.figures.alt
      .replace('{{document}}', figureSource.documentTitle)
      .replace('{{page}}', String(figureSource.page));
    expect(screen.getByRole('img', { name: figureName })).toBeInTheDocument();
  });

  it('renders no image when the model cited a figure that was never retrieved', () => {
    const events: AssistantEvent[] = [
      { type: 'sources', sources: [figureSource] },
      { type: 'figure', sourceId: 'azul:rulebook:p99:c01' },
    ];

    const state = events.reduce(reduceAssistantEvent, startAnswer());

    render(<AnswerPanel state={state} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('replaces the answer with an alert when the engine fails', () => {
    render(
      <AnswerPanel
        state={stateWith({
          text: 'to nie powinno się pokazać',
          error: { code: 'engine_unreachable', message: 'ECONNREFUSED 127.0.0.1:8000' },
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(pl.answer.error.engine_unreachable);
    expect(screen.queryByText('to nie powinno się pokazać')).not.toBeInTheDocument();
  });

  it('keeps the technical detail visible next to the translated error', () => {
    render(
      <AnswerPanel
        state={stateWith({
          error: { code: 'http_error', message: 'Engine responded with HTTP 503.' },
        })}
      />,
    );

    expect(screen.getByText('Engine responded with HTTP 503.')).toBeInTheDocument();
  });

  it('falls back to a generic sentence for a code it has no wording for', () => {
    // The engine can ship a new code before the frontend learns the word for
    // it; showing the bare code to somebody mid-game is not an option.
    render(
      <AnswerPanel
        state={stateWith({ error: { code: 'kaboom', message: 'upstream exploded' } })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(pl.answer.error.unknown);
    expect(screen.queryByText('kaboom')).not.toBeInTheDocument();
  });

  it('phrases an engine notice from its code and values', () => {
    render(
      <AnswerPanel
        state={stateWith({
          notice: { code: 'engine_not_indexed', params: { gameId: 'azul', profile: 'full-64gb' } },
        })}
      />,
    );

    expect(
      screen.getByText(
        (content, element) =>
          element?.tagName === 'P' && content.includes('azul') && content.includes('full-64gb'),
      ),
    ).toBeInTheDocument();
  });

  it('renders every string in the requested language', () => {
    // The real assertion is that nothing here is hardcoded: the same state in
    // another locale has to come out in that locale's words.
    render(<AnswerPanel state={stateWith({ groundedness: 'insufficient_evidence' })} />, 'en');

    expect(screen.getByRole('alert')).toHaveTextContent(en.answer.insufficientEvidence.title);
    expect(screen.queryByText(pl.answer.insufficientEvidence.title)).not.toBeInTheDocument();
  });

  it('labels a source with the translated document kind', () => {
    const state = stateWith({ sources: [figureSource] });

    render(<AnswerPanel state={state} />, 'en');

    expect(screen.getByText(`${en.documentKind.rulebook}, p. 4`)).toBeInTheDocument();
  });
});
