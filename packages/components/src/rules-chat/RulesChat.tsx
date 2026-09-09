'use client';

import type { GameSummary } from '@bga/api-contract';
import { ConversationLog } from '@bga/components/conversation-log';
import { useAskStream } from '@bga/hooks/use-ask-stream';
import { useConversationThread } from '@bga/hooks/use-conversation-thread';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { streamingStatusKey } from '@bga/utils/answer-state';
import { selectExchanges } from '@bga/utils/conversation-thread';
import { GAMES_CHANGED_EVENT } from '@bga/utils/desktop-bridge';
import { isGameSummaryList } from '@bga/utils/game-summary';
import { Button, Checkbox, Fieldset, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import {
  type ChangeEvent,
  type FC,
  type KeyboardEvent,
  type SubmitEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

interface ExpansionCheckboxProps {
  expansionId: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (expansionId: string, checked: boolean) => void;
}

const ExpansionCheckbox: FC<ExpansionCheckboxProps> = ({
  expansionId,
  title,
  checked,
  disabled,
  onToggle,
}) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onToggle(expansionId, event.currentTarget.checked);
  };

  return <Checkbox label={title} checked={checked} onChange={handleChange} disabled={disabled} />;
};

export const RulesChat: FC = () => {
  const { t } = useTranslation();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const enginePhase = useEngineReadiness();
  const [expansionIds, setExpansionIds] = useState<string[]>([]);
  const [expansionsCleared, setExpansionsCleared] = useState(false);
  const [question, setQuestion] = useState('');
  const [activeExchangeId, setActiveExchangeId] = useState<string | null>(null);
  const expansionsStatusId = useId();
  const { state, ask, cancel } = useAskStream();
  const { thread, lastSaveSucceeded, beginExchange, updateAnswer, dropExchange } =
    useConversationThread(gameId);
  const wasStreamingRef = useRef(false);
  const screenExchanges = selectExchanges(thread, 'screen');

  useEffect(() => {
    let cancelled = false;

    const loadGames = async (): Promise<void> => {
      try {
        const response = await fetch('/api/engine/games');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!cancelled && isGameSummaryList(payload)) {
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

  useEffect(() => {
    if (activeExchangeId === null) {
      wasStreamingRef.current = false;
      return;
    }
    updateAnswer(activeExchangeId, state);
    if (state.isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      setActiveExchangeId(null);
    }
  }, [activeExchangeId, state, updateAnswer]);

  const baseGames = (games ?? []).filter((game) => game.baseGameId === null);
  const expansionsForBase =
    gameId === null ? [] : (games ?? []).filter((game) => game.baseGameId === gameId);
  const picksLocked = state.isStreaming;

  const canAsk =
    enginePhase === 'ready' && gameId !== null && question.trim().length > 0 && !state.isStreaming;

  const onBaseGameChange = (next: string | null): void => {
    if (state.isStreaming) {
      return;
    }
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

  const handleCancel = (): void => {
    cancel();
    if (activeExchangeId !== null) {
      dropExchange(activeExchangeId);
      setActiveExchangeId(null);
    }
  };

  const submitQuestion = (): void => {
    if (!canAsk || gameId === null) {
      return;
    }
    const questionText = question.trim();
    const id = beginExchange({
      question: questionText,
      mode: 'arbitrate',
      expansionIds: [...expansionIds],
    });
    setActiveExchangeId(id);
    setQuestion('');
    void ask({
      gameId,
      question: questionText,
      mode: 'arbitrate',
      expansionIds: expansionIds.length > 0 ? expansionIds : undefined,
    });
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitQuestion();
  };

  const onTextareaKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitQuestion();
    }
  };

  const handleQuestionChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setQuestion(event.currentTarget.value);
  };

  const statusKey = streamingStatusKey(state);

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
            disabled={games === null || baseGames.length === 0 || picksLocked}
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
                <ExpansionCheckbox
                  key={expansion.gameId}
                  expansionId={expansion.gameId}
                  title={expansion.title}
                  checked={expansionIds.includes(expansion.gameId)}
                  disabled={picksLocked}
                  onToggle={toggleExpansion}
                />
              ))}
            </Stack>
          </Fieldset>
        )}

        <ConversationLog exchanges={screenExchanges} />

        <Textarea
          label={t('rulesChat.question.label')}
          placeholder={t('rulesChat.question.placeholder')}
          value={question}
          onChange={handleQuestionChange}
          onKeyDown={onTextareaKeyDown}
          autosize
          minRows={2}
        />

        <Group>
          <Button type="submit" disabled={!canAsk} loading={state.isStreaming}>
            {t('rulesChat.submit')}
          </Button>
          {state.isStreaming && (
            <Button type="button" variant="subtle" color="gray" onClick={handleCancel}>
              {t('rulesChat.cancel')}
            </Button>
          )}
          <Text size="sm" c="dimmed" role="status" aria-live="polite">
            {statusKey !== null ? t(statusKey) : ''}
          </Text>
        </Group>

        {!lastSaveSucceeded && (
          <Text size="sm" c="dimmed" role="status">
            {t('rulesChat.thread.saveFailed')}
          </Text>
        )}
      </Stack>
    </form>
  );
};
