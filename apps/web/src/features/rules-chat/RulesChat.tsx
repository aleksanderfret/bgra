'use client';

import type { AnswerMode, GameSummary } from '@bga/api-contract';
import {
  Button,
  Checkbox,
  Fieldset,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEngineReadiness } from '@/features/engine-readiness/useEngineReadiness';
import { GAMES_CHANGED_EVENT } from '@/lib/desktop-bridge';
import { AnswerPanel } from './AnswerPanel';
import { useAskStream } from './useAskStream';

const MODES: readonly AnswerMode[] = ['teach', 'arbitrate'];

const isAnswerMode = (value: string): value is AnswerMode =>
  (MODES as readonly string[]).includes(value);

export function RulesChat() {
  const { t } = useTranslation();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const enginePhase = useEngineReadiness();
  const [expansionIds, setExpansionIds] = useState<string[]>([]);
  const [expansionsCleared, setExpansionsCleared] = useState(false);
  const [mode, setMode] = useState<AnswerMode>('teach');
  const [question, setQuestion] = useState('');
  const expansionsStatusId = useId();
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
        }
      } catch {
        if (!cancelled && enginePhase === 'offline') {
          setGames([]);
        }
      }
    };

    void loadGames();
    const onGamesChanged = (): void => {
      void loadGames();
    };
    window.addEventListener(GAMES_CHANGED_EVENT, onGamesChanged);
    const retry =
      enginePhase === 'ready'
        ? null
        : window.setInterval(() => {
            void loadGames();
          }, 1_000);
    return () => {
      cancelled = true;
      window.removeEventListener(GAMES_CHANGED_EVENT, onGamesChanged);
      if (retry !== null) {
        window.clearInterval(retry);
      }
    };
  }, [enginePhase]);

  const baseGames = (games ?? []).filter((game) => game.baseGameId === null);
  const expansionsForBase =
    gameId === null ? [] : (games ?? []).filter((game) => game.baseGameId === gameId);

  const canAsk =
    enginePhase === 'ready' && gameId !== null && question.trim().length > 0 && !state.isStreaming;

  const onBaseGameChange = (next: string | null): void => {
    setGameId(next);
    if (expansionIds.length > 0) {
      setExpansionIds([]);
      setExpansionsCleared(true);
    } else {
      setExpansionsCleared(false);
    }
  };

  const toggleExpansion = (expansionId: string, checked: boolean): void => {
    setExpansionsCleared(false);
    setExpansionIds((current) => {
      if (checked) {
        return current.includes(expansionId) ? current : [...current, expansionId];
      }
      return current.filter((id) => id !== expansionId);
    });
  };

  const submitQuestion = (): void => {
    if (!canAsk || gameId === null) {
      return;
    }
    void ask({
      gameId,
      question: question.trim(),
      mode,
      expansionIds: expansionIds.length > 0 ? expansionIds : undefined,
    });
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
        <Fieldset legend={t('rulesChat.game.label')} variant="filled">
          <Select
            description={t('rulesChat.game.description')}
            placeholder={
              games === null ? t('rulesChat.game.loading') : t('rulesChat.game.placeholder')
            }
            data={baseGames.map((game) => ({ value: game.gameId, label: game.title }))}
            value={gameId}
            onChange={onBaseGameChange}
            disabled={games === null || baseGames.length === 0}
            aria-busy={games === null}
            aria-describedby={expansionsCleared ? expansionsStatusId : undefined}
            searchable
          />
          {expansionsCleared && (
            <Text id={expansionsStatusId} size="sm" c="dimmed" role="status" aria-live="polite">
              {t('rulesChat.expansions.cleared')}
            </Text>
          )}
        </Fieldset>

        {expansionsForBase.length > 0 && (
          <Fieldset legend={t('rulesChat.expansions.legend')} variant="filled">
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                {t('rulesChat.expansions.description')}
              </Text>
              {expansionsForBase.map((expansion) => (
                <Checkbox
                  key={expansion.gameId}
                  label={expansion.title}
                  checked={expansionIds.includes(expansion.gameId)}
                  onChange={(event) =>
                    toggleExpansion(expansion.gameId, event.currentTarget.checked)
                  }
                  disabled={state.isStreaming}
                />
              ))}
            </Stack>
          </Fieldset>
        )}

        <Fieldset legend={t('rulesChat.mode.legend')} variant="filled">
          <SegmentedControl
            value={mode}
            onChange={(value) => {
              if (isAnswerMode(value)) {
                setMode(value);
              }
            }}
            data={MODES.map((value) => ({ value, label: t(`rulesChat.mode.${value}`) }))}
            fullWidth
          />
        </Fieldset>

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
