import type { AssistantEvent, RetrievedSource } from '@bga/api-contract';
import { describe, expect, it } from 'vitest';
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

    expect(screen.getByRole('alert')).toHaveTextContent('Brak podstawy w dokumentach');
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

    expect(screen.getByAltText('Azul — instrukcja, strona 4')).toBeInTheDocument();
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
          error: { code: 'engine_unreachable', message: 'Silnik nie odpowiada.' },
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Silnik nie odpowiada.');
    expect(screen.queryByText('to nie powinno się pokazać')).not.toBeInTheDocument();
  });
});
