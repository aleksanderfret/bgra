'use client';

import { Alert, Badge, Group, Image, Paper, Stack, Text, Title } from '@mantine/core';
import { type AnswerState, selectVisibleFigures } from './answer-state';

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  rulebook: 'instrukcja',
  faq: 'FAQ',
  errata: 'errata',
  player_aid: 'pomoc gracza',
  video_transcript: 'transkrypcja wideo',
};

export interface AnswerPanelProps {
  state: AnswerState;
}

export function AnswerPanel({ state }: AnswerPanelProps) {
  const figures = selectVisibleFigures(state);

  if (state.error !== null) {
    return (
      <Alert color="red" title="Błąd silnika" role="alert">
        {state.error.message}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {state.transcript !== null && (
        <Text size="sm" c="dimmed">
          Usłyszałem: „{state.transcript}”
        </Text>
      )}

      {state.groundedness === 'insufficient_evidence' && (
        <Alert color="yellow" title="Brak podstawy w dokumentach" role="alert">
          Ta odpowiedź nie ma pokrycia w wczytanych materiałach. Dodaj erratę lub FAQ do tej gry,
          zamiast traktować powyższy tekst jako regułę.
        </Alert>
      )}

      {state.text.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text style={{ whiteSpace: 'pre-wrap' }}>{state.text}</Text>
        </Paper>
      )}

      {figures.length > 0 && (
        <Stack gap="xs">
          <Title order={4}>Wskazówka wizualna</Title>
          {figures.map((figure) => (
            <Paper key={figure.id} withBorder p="xs" radius="md">
              <Image
                src={figure.imageUrl}
                alt={`${figure.documentTitle}, strona ${figure.page ?? '—'}`}
                radius="sm"
              />
            </Paper>
          ))}
        </Stack>
      )}

      {state.sources.length > 0 && (
        <Stack gap="xs">
          <Title order={5}>Źródła</Title>
          <Group gap="xs">
            {state.sources.map((source) => (
              <Badge key={source.id} variant="light" title={source.excerpt}>
                {DOCUMENT_KIND_LABELS[source.documentKind] ?? source.documentKind}
                {source.page !== null && `, s. ${source.page}`}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
