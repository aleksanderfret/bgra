'use client';

import type { AnswerMode, GameSummary } from '@bga/api-contract';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { AnswerPanel } from './AnswerPanel';
import { useAskStream } from './useAskStream';

const MODE_OPTIONS: { value: AnswerMode; label: string }[] = [
  { value: 'teach', label: 'Naucz mnie gry' },
  { value: 'arbitrate', label: 'Rozstrzygnij zasadę' },
];

const isAnswerMode = (value: string): value is AnswerMode =>
  MODE_OPTIONS.some((option) => option.value === value);

export function RulesChat() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [engineOffline, setEngineOffline] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [mode, setMode] = useState<AnswerMode>('teach');
  const [question, setQuestion] = useState('');
  const { state, ask } = useAskStream();

  useEffect(() => {
    let cancelled = false;

    const loadGames = async (): Promise<void> => {
      try {
        const response = await fetch('/api/engine/games');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as GameSummary[];
        if (!cancelled) {
          setGames(payload);
        }
      } catch {
        if (!cancelled) {
          setEngineOffline(true);
          setGames([]);
        }
      }
    };

    void loadGames();
    return () => {
      cancelled = true;
    };
  }, []);

  const canAsk = gameId !== null && question.trim().length > 0 && !state.isStreaming;

  return (
    <Stack gap="lg">
      {engineOffline && (
        <Alert color="orange" title="Silnik RAG nie odpowiada" role="alert">
          Uruchom go poleceniem <Text component="code">pnpm dev</Text> w katalogu repozytorium.
          Interfejs działa, ale bez silnika nie ma skąd wziąć zasad.
        </Alert>
      )}

      <Select
        label="Gra"
        description="Wyszukiwanie jest zawsze zawężone do jednej gry"
        placeholder={games === null ? 'Wczytuję…' : 'Wybierz grę'}
        data={(games ?? []).map((game) => ({ value: game.gameId, label: game.title }))}
        value={gameId}
        onChange={setGameId}
        disabled={games === null || games.length === 0}
        searchable
      />

      <SegmentedControl
        value={mode}
        onChange={(value) => {
          if (isAnswerMode(value)) {
            setMode(value);
          }
        }}
        data={MODE_OPTIONS}
      />

      <Textarea
        label="Pytanie"
        placeholder="Czy mogę zagrać kartę akcji, jeśli nie mam już kafelków?"
        value={question}
        onChange={(event) => setQuestion(event.currentTarget.value)}
        autosize
        minRows={2}
      />

      <Group>
        <Button
          onClick={() => {
            void ask({ gameId: gameId ?? '', question: question.trim(), mode });
          }}
          disabled={!canAsk}
          loading={state.isStreaming}
        >
          Zapytaj
        </Button>
        {state.isStreaming && (
          <Text size="sm" c="dimmed">
            {state.stage}
          </Text>
        )}
      </Group>

      <AnswerPanel state={state} />
    </Stack>
  );
}
