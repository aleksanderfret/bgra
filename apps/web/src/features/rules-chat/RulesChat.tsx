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
import { type FormEvent, type KeyboardEvent, useEffect, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { GAMES_CHANGED_EVENT } from '@/lib/desktop-bridge';
import { AnswerPanel } from './AnswerPanel';
import { useAskStream } from './useAskStream';

const MODES: readonly AnswerMode[] = ['teach', 'arbitrate'];

const isAnswerMode = (value: string): value is AnswerMode =>
  (MODES as readonly string[]).includes(value);

export function RulesChat() {
  const { t } = useTranslation();
  const modeLabelId = useId();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [engineOffline, setEngineOffline] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [mode, setMode] = useState<AnswerMode>('teach');
  const [question, setQuestion] = useState('');
  const { state, ask, cancel } = useAskStream();

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
          setEngineOffline(false);
        }
      } catch {
        if (!cancelled) {
          setEngineOffline(true);
          setGames([]);
        }
      }
    };

    void loadGames();
    const onGamesChanged = (): void => {
      void loadGames();
    };
    window.addEventListener(GAMES_CHANGED_EVENT, onGamesChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(GAMES_CHANGED_EVENT, onGamesChanged);
    };
  }, []);

  const canAsk = gameId !== null && question.trim().length > 0 && !state.isStreaming;

  const submitQuestion = (): void => {
    if (canAsk) {
      void ask({ gameId: gameId ?? '', question: question.trim(), mode });
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submitQuestion();
  };

  const onTextareaKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitQuestion();
    }
  };

  return (
    <form onSubmit={onSubmit} aria-label={t('rulesChat.formLabel')}>
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
          placeholder={
            games === null ? t('rulesChat.game.loading') : t('rulesChat.game.placeholder')
          }
          data={(games ?? []).map((game) => ({ value: game.gameId, label: game.title }))}
          value={gameId}
          onChange={setGameId}
          disabled={games === null || games.length === 0}
          aria-busy={games === null}
          searchable
        />

        <Stack gap={4}>
          <Text id={modeLabelId} size="sm" fw={500}>
            {t('rulesChat.mode.label')}
          </Text>
          <SegmentedControl
            aria-labelledby={modeLabelId}
            value={mode}
            onChange={(value) => {
              if (isAnswerMode(value)) {
                setMode(value);
              }
            }}
            data={MODES.map((value) => ({ value, label: t(`rulesChat.mode.${value}`) }))}
          />
        </Stack>

        <Textarea
          label={t('rulesChat.question.label')}
          placeholder={t('rulesChat.question.placeholder')}
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          onKeyDown={onTextareaKeyDown}
          autosize
          minRows={2}
        />

        <Group>
          <Button type="submit" disabled={!canAsk} loading={state.isStreaming}>
            {t('rulesChat.submit')}
          </Button>
          {state.isStreaming && (
            <Button type="button" variant="subtle" color="gray" onClick={cancel}>
              {t('rulesChat.cancel')}
            </Button>
          )}
          <Text size="sm" c="dimmed" role="status" aria-live="polite">
            {state.isStreaming && state.stage !== 'idle' ? t(`stage.${state.stage}`) : ''}
          </Text>
        </Group>

        <AnswerPanel state={state} />
      </Stack>
    </form>
  );
}
