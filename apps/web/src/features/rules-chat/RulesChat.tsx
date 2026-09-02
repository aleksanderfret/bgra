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
import { Trans, useTranslation } from 'react-i18next';
import { AnswerPanel } from './AnswerPanel';
import { useAskStream } from './useAskStream';

const MODES: readonly AnswerMode[] = ['teach', 'arbitrate'];

const isAnswerMode = (value: string): value is AnswerMode =>
  (MODES as readonly string[]).includes(value);

export function RulesChat() {
  const { t } = useTranslation();
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
        <Alert color="orange" title={t('rulesChat.engineOffline.title')} role="alert">
          <Trans
            i18nKey="rulesChat.engineOffline.body"
            components={{ command: <Text component="code" /> }}
          />
        </Alert>
      )}

      <Select
        label={t('rulesChat.game.label')}
        description={t('rulesChat.game.description')}
        placeholder={games === null ? t('rulesChat.game.loading') : t('rulesChat.game.placeholder')}
        data={(games ?? []).map((game) => ({ value: game.gameId, label: game.title }))}
        value={gameId}
        onChange={setGameId}
        disabled={games === null || games.length === 0}
        searchable
      />

      <SegmentedControl
        aria-label={t('rulesChat.mode.label')}
        value={mode}
        onChange={(value) => {
          if (isAnswerMode(value)) {
            setMode(value);
          }
        }}
        data={MODES.map((value) => ({ value, label: t(`rulesChat.mode.${value}`) }))}
      />

      <Textarea
        label={t('rulesChat.question.label')}
        placeholder={t('rulesChat.question.placeholder')}
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
          {t('rulesChat.submit')}
        </Button>
        {state.isStreaming && state.stage !== 'idle' && (
          <Text size="sm" c="dimmed">
            {t(`stage.${state.stage}`)}
          </Text>
        )}
      </Group>

      <AnswerPanel state={state} />
    </Stack>
  );
}
