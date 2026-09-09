'use client';

import type { GameSummary, LessonSession, LessonTurn, RetrievedSource } from '@bga/api-contract';
import { AnswerPanel } from '@bga/components/answer-panel';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { useLessonStream } from '@bga/hooks/use-lesson-stream';
import { isBlockingNotice, streamingStatusKey } from '@bga/utils/answer-state';
import { GAMES_CHANGED_EVENT } from '@bga/utils/desktop-bridge';
import { isGameSummaryList } from '@bga/utils/game-summary';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Fieldset,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
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

const AUTO_CONTINUE_MS = 8_000;

const ACTIVE_STATUSES = new Set(['active', 'paused']);

const SUCCESSFUL_GROUNDEDNESS = new Set(['grounded', 'partial']);

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

interface TurnSourcesProps {
  sources: RetrievedSource[];
}

const TurnSources: FC<TurnSourcesProps> = ({ sources }) => {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return null;
  }
  return (
    <Box
      component="ul"
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--mantine-spacing-xs)',
      }}
    >
      {sources.map((source) => (
        <li key={source.id}>
          <Badge variant="light" title={source.excerpt}>
            {t(`documentKind.${source.documentKind}`)}
            {source.page !== null && t('answer.sources.page', { page: source.page })}
          </Badge>
        </li>
      ))}
    </Box>
  );
};

interface TurnEntryProps {
  turn: LessonTurn;
  unitTitle: string | null;
}

const TurnEntry: FC<TurnEntryProps> = ({ turn, unitTitle }) => {
  const { t } = useTranslation();
  const kindLabel = t(`teach.turn.${turn.kind}`);
  const heading = unitTitle ?? kindLabel;

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {kindLabel}
      </Text>
      <Title order={4}>{heading}</Title>
      {turn.question !== null && turn.question !== undefined && turn.question.length > 0 && (
        <Text fw={600}>{turn.question}</Text>
      )}
      {turn.text.length > 0 && <Text style={{ whiteSpace: 'pre-wrap' }}>{turn.text}</Text>}
      <TurnSources sources={turn.sources} />
    </Stack>
  );
};

const unitTitleFor = (session: LessonSession, turn: LessonTurn): string | null => {
  if (turn.unitId === null || turn.unitId === undefined) {
    return null;
  }
  const unit = session.syllabus.find((entry) => entry.unitId === turn.unitId);
  return unit?.title ?? null;
};

export const LessonPanel: FC = () => {
  const { t } = useTranslation();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const enginePhase = useEngineReadiness();
  const [expansionIds, setExpansionIds] = useState<string[]>([]);
  const [expansionsCleared, setExpansionsCleared] = useState(false);
  const [digressionOpen, setDigressionOpen] = useState(false);
  const [digressionQuestion, setDigressionQuestion] = useState('');
  const expansionsStatusId = useId();
  const {
    state,
    sessionId,
    session,
    start,
    continue: continueSession,
    repeat,
    ask,
    cancel,
    syncActive,
  } = useLessonStream();
  const logEndRef = useRef<HTMLDivElement>(null);
  const autoContinueRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasStreamingRef = useRef(false);
  const lastUnitActionRef = useRef(false);
  const pendingAutoContinueRef = useRef(false);
  const continueInFlightRef = useRef(false);

  const clearAutoContinue = (): void => {
    if (autoContinueRef.current !== null) {
      clearTimeout(autoContinueRef.current);
      autoContinueRef.current = null;
    }
    pendingAutoContinueRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (autoContinueRef.current !== null) {
        clearTimeout(autoContinueRef.current);
        autoContinueRef.current = null;
      }
    };
  }, []);

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
    if (gameId === null) {
      return;
    }
    void syncActive(gameId);
  }, [gameId, syncActive]);

  const turnCount = session?.turns.length ?? 0;
  const streamedLength = state.text.length;

  useEffect(() => {
    if (turnCount === 0 && !state.isStreaming && streamedLength === 0) {
      return;
    }
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [turnCount, state.isStreaming, streamedLength]);

  useEffect(() => {
    if (state.isStreaming) {
      wasStreamingRef.current = true;
      if (autoContinueRef.current !== null) {
        clearTimeout(autoContinueRef.current);
        autoContinueRef.current = null;
      }
      return;
    }

    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      continueInFlightRef.current = false;
      const unitOk =
        lastUnitActionRef.current &&
        !digressionOpen &&
        state.error === null &&
        state.groundedness !== null &&
        SUCCESSFUL_GROUNDEDNESS.has(state.groundedness) &&
        (state.notice === null || !isBlockingNotice(state.notice.code));
      if (unitOk) {
        pendingAutoContinueRef.current = true;
      } else {
        pendingAutoContinueRef.current = false;
      }
    }

    if (!pendingAutoContinueRef.current || digressionOpen) {
      return;
    }
    if (sessionId === null || session === null || session.status === 'completed') {
      if (session?.status === 'completed') {
        pendingAutoContinueRef.current = false;
      }
      return;
    }

    pendingAutoContinueRef.current = false;
    if (autoContinueRef.current !== null) {
      clearTimeout(autoContinueRef.current);
      autoContinueRef.current = null;
    }
    const advanceSessionId = sessionId;
    autoContinueRef.current = setTimeout(() => {
      autoContinueRef.current = null;
      if (continueInFlightRef.current) {
        return;
      }
      continueInFlightRef.current = true;
      lastUnitActionRef.current = true;
      void continueSession(advanceSessionId);
    }, AUTO_CONTINUE_MS);
  }, [
    state.isStreaming,
    state.error,
    state.groundedness,
    state.notice,
    digressionOpen,
    session,
    sessionId,
    continueSession,
  ]);

  const baseGames = (games ?? []).filter((game) => game.baseGameId === null);
  const expansionsForBase =
    gameId === null ? [] : (games ?? []).filter((game) => game.baseGameId === gameId);
  const hasActiveLesson =
    session !== null && ACTIVE_STATUSES.has(session.status) && session.sessionId.length > 0;
  const picksLocked = state.isStreaming || hasActiveLesson;
  const engineReady = enginePhase === 'ready';
  const canStart = engineReady && gameId !== null && !state.isStreaming;
  const canResume = canStart && hasActiveLesson;
  const canShowPostStreamPanel =
    !state.isStreaming &&
    (state.error !== null ||
      state.groundedness === 'insufficient_evidence' ||
      (state.notice !== null && isBlockingNotice(state.notice.code)));
  const showUnitActions =
    !state.isStreaming &&
    hasActiveLesson &&
    sessionId !== null &&
    session !== null &&
    session.status !== 'completed' &&
    turnCount > 0;

  const onBaseGameChange = (next: string | null): void => {
    if (state.isStreaming) {
      return;
    }
    clearAutoContinue();
    setDigressionOpen(false);
    setDigressionQuestion('');
    setGameId(next);
    if (expansionIds.length > 0) {
      setExpansionIds([]);
      setExpansionsCleared(true);
    } else {
      setExpansionsCleared(false);
    }
  };

  const toggleExpansion = (expansionId: string, checked: boolean): void => {
    if (picksLocked) {
      return;
    }
    setExpansionsCleared(false);
    setExpansionIds((current) => {
      if (checked) {
        return current.includes(expansionId) ? current : [...current, expansionId];
      }
      return current.filter((id) => id !== expansionId);
    });
  };

  const handleStart = (): void => {
    if (!canStart || gameId === null) {
      return;
    }
    clearAutoContinue();
    setDigressionOpen(false);
    setDigressionQuestion('');
    lastUnitActionRef.current = true;
    void start(gameId, expansionIds);
  };

  const handleResume = (): void => {
    if (!canResume || sessionId === null) {
      return;
    }
    clearAutoContinue();
    setDigressionOpen(false);
    lastUnitActionRef.current = true;
    continueInFlightRef.current = true;
    void continueSession(sessionId);
  };

  const handleContinue = (): void => {
    if (continueInFlightRef.current || sessionId === null || state.isStreaming) {
      return;
    }
    clearAutoContinue();
    setDigressionOpen(false);
    lastUnitActionRef.current = true;
    continueInFlightRef.current = true;
    void continueSession(sessionId);
  };

  const handleRepeat = (): void => {
    if (sessionId === null || state.isStreaming) {
      return;
    }
    clearAutoContinue();
    setDigressionOpen(false);
    lastUnitActionRef.current = true;
    void repeat(sessionId);
  };

  const handleAskQuestionToggle = (): void => {
    clearAutoContinue();
    setDigressionOpen((open) => !open);
  };

  const submitDigression = (): void => {
    if (sessionId === null || digressionQuestion.trim().length === 0 || state.isStreaming) {
      return;
    }
    clearAutoContinue();
    lastUnitActionRef.current = false;
    const question = digressionQuestion.trim();
    setDigressionQuestion('');
    setDigressionOpen(false);
    void ask(sessionId, question);
  };

  const onDigressionSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitDigression();
  };

  const onDigressionKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitDigression();
    }
  };

  const handleDigressionChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDigressionQuestion(event.currentTarget.value);
  };

  const handleCancel = (): void => {
    clearAutoContinue();
    cancel();
  };

  const statusKey = streamingStatusKey(state);
  const progressCurrent =
    session === null ? 0 : Math.min(session.unitIndex + 1, session.syllabus.length);
  const progressTotal = session?.syllabus.length ?? 0;

  return (
    <Stack gap="lg" aria-label={t('teach.formLabel')}>
      <Fieldset legend={t('rulesChat.game.label')} variant="filled">
        <Select
          description={t('rulesChat.game.description')}
          placeholder={
            games === null ? t('rulesChat.game.loading') : t('rulesChat.game.placeholder')
          }
          data={baseGames.map((game) => ({ value: game.gameId, label: game.title }))}
          value={gameId}
          onChange={onBaseGameChange}
          disabled={games === null || baseGames.length === 0 || state.isStreaming}
          aria-busy={games === null}
          aria-describedby={expansionsCleared ? expansionsStatusId : undefined}
          searchable
        />
        {expansionsCleared && (
          <Text id={expansionsStatusId} size="sm" c="dimmed" role="status" aria-live="polite">
            {t('rulesChat.expansions.cleared')}
          </Text>
        )}
        {games !== null && baseGames.length === 0 && (
          <Text size="sm" c="dimmed" role="status">
            {t('teach.noGames')}
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

      <Group>
        <Button
          type="button"
          disabled={!canStart}
          loading={state.isStreaming}
          onClick={handleStart}
        >
          {t('teach.start')}
        </Button>
        {hasActiveLesson && (
          <Button type="button" variant="light" disabled={!canResume} onClick={handleResume}>
            {t('teach.continueLesson')}
          </Button>
        )}
        {state.isStreaming && (
          <Button type="button" variant="subtle" color="gray" onClick={handleCancel}>
            {t('teach.cancel')}
          </Button>
        )}
        <Text size="sm" c="dimmed" role="status" aria-live="polite">
          {statusKey !== null ? t(statusKey) : ''}
        </Text>
      </Group>

      {session !== null && progressTotal > 0 && (
        <Text size="sm" c="dimmed" role="status">
          {t('teach.progress', { current: progressCurrent, total: progressTotal })}
        </Text>
      )}

      {(turnCount > 0 || state.isStreaming || canShowPostStreamPanel) && (
        <ScrollArea mah="60vh" type="auto">
          <Stack gap="lg" role="log" aria-label={t('teach.logLabel')}>
            {session?.turns.map((turn) => (
              <TurnEntry
                key={turn.id}
                turn={turn}
                unitTitle={session === null ? null : unitTitleFor(session, turn)}
              />
            ))}
            {state.isStreaming && <AnswerPanel state={state} live />}
            {canShowPostStreamPanel && <AnswerPanel state={state} />}
            <div ref={logEndRef} />
          </Stack>
        </ScrollArea>
      )}

      {showUnitActions && (
        <Stack gap="sm">
          <Group>
            <Button type="button" onClick={handleContinue}>
              {t('teach.continue')}
            </Button>
            <Button type="button" variant="light" onClick={handleRepeat}>
              {t('teach.repeat')}
            </Button>
            <Button
              type="button"
              variant={digressionOpen ? 'filled' : 'light'}
              onClick={handleAskQuestionToggle}
            >
              {t('teach.askQuestion')}
            </Button>
          </Group>
          {!digressionOpen && (
            <Text size="sm" c="dimmed" role="status">
              {t('teach.autoAdvanceHint')}
            </Text>
          )}
          {digressionOpen && (
            <form onSubmit={onDigressionSubmit}>
              <Stack gap="sm">
                <Textarea
                  label={t('teach.askQuestion')}
                  placeholder={t('teach.digressionPlaceholder')}
                  value={digressionQuestion}
                  onChange={handleDigressionChange}
                  onKeyDown={onDigressionKeyDown}
                  autosize
                  minRows={2}
                />
                <Button type="submit" disabled={digressionQuestion.trim().length === 0}>
                  {t('teach.askSubmit')}
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
      )}
    </Stack>
  );
};
