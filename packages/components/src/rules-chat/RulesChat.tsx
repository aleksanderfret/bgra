'use client';

import { AnswerPanel } from '@bga/components/answer-panel';
import { ConversationLog } from '@bga/components/conversation-log';
import { GamePicker } from '@bga/components/game-picker';
import { useAskStream } from '@bga/hooks/use-ask-stream';
import { useAudioQueue } from '@bga/hooks/use-audio-queue';
import { useConversationThread } from '@bga/hooks/use-conversation-thread';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { useGameCatalogue } from '@bga/hooks/use-game-catalogue';
import { useHoldToTalk } from '@bga/hooks/use-hold-to-talk';
import { type AnswerState, isBlockingNotice, streamingStatusKey } from '@bga/utils/answer-state';
import {
  findReusableExchange,
  freezeAnswer,
  selectExchanges,
} from '@bga/utils/conversation-thread';
import { loadReadAloudPreference, saveReadAloudPreference } from '@bga/utils/voice-prefs';
import { Button, Checkbox, Fieldset, Group, Stack, Switch, Text, Textarea } from '@mantine/core';
import {
  type ChangeEvent,
  type FC,
  type KeyboardEvent,
  type PointerEvent,
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
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'pl' ? 'pl' : 'en';
  const { games } = useGameCatalogue();
  const [gameId, setGameId] = useState<string | null>(null);
  const { phase: enginePhase } = useEngineReadiness();
  const [expansionIds, setExpansionIds] = useState<string[]>([]);
  const [expansionsCleared, setExpansionsCleared] = useState(false);
  const [question, setQuestion] = useState('');
  const [activeExchangeId, setActiveExchangeId] = useState<string | null>(null);
  const [readAloud, setReadAloud] = useState(loadReadAloudPreference);
  const [voiceFailure, setVoiceFailure] = useState<AnswerState | null>(null);
  const expansionsStatusId = useId();
  const { state, ask, cancel } = useAskStream();
  const { enqueue, stop: stopAudio } = useAudioQueue();
  const {
    thread,
    lastSaveSucceeded,
    beginExchange,
    updateAnswer,
    renameExchangeQuestion,
    dropExchange,
  } = useConversationThread(gameId);
  const wasStreamingRef = useRef(false);
  const voicePendingRef = useRef(false);
  const readAloudRef = useRef(readAloud);
  readAloudRef.current = readAloud;
  const screenExchanges = selectExchanges(thread, 'screen');

  const enqueueIfReadAloud = (frame: {
    sequence: number;
    mimeType: string;
    dataBase64: string;
  }): void => {
    if (readAloudRef.current) {
      enqueue(frame);
    }
  };
  useEffect(() => {
    if (
      voicePendingRef.current &&
      state.transcript !== null &&
      activeExchangeId !== null &&
      state.transcript.trim().length > 0
    ) {
      voicePendingRef.current = false;
      setVoiceFailure(null);
      renameExchangeQuestion(activeExchangeId, state.transcript);
    }
  }, [activeExchangeId, renameExchangeQuestion, state.transcript]);

  useEffect(() => {
    if (voicePendingRef.current && state.isStreaming) {
      wasStreamingRef.current = true;
    }
    if (
      voicePendingRef.current &&
      !state.isStreaming &&
      (state.transcript === null || state.transcript.trim().length === 0)
    ) {
      voicePendingRef.current = false;
      const failed =
        state.error !== null || (state.notice !== null && isBlockingNotice(state.notice.code));
      setVoiceFailure(failed ? state : null);
      if (activeExchangeId !== null && failed) {
        dropExchange(activeExchangeId);
        setActiveExchangeId(null);
      }
    }
    if (activeExchangeId === null) {
      if (!voicePendingRef.current) {
        wasStreamingRef.current = false;
      }
      return;
    }
    // Ignore leftover idle state from the previous turn so we do not wipe a
    // freshly opened exchange before the new stream's startAnswer arrives.
    if (!state.isStreaming && !wasStreamingRef.current) {
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
  }, [activeExchangeId, dropExchange, state, updateAnswer]);

  const baseGames = (games ?? []).filter((game) => game.baseGameId === null);
  const expansionsForBase =
    gameId === null ? [] : (games ?? []).filter((game) => game.baseGameId === gameId);
  const picksLocked = state.isStreaming;
  const engineReady = enginePhase === 'ready';
  const canTextAsk =
    engineReady && gameId !== null && question.trim().length > 0 && !state.isStreaming;
  const canVoiceAsk = engineReady && gameId !== null && !state.isStreaming;

  const onBaseGameChange = (next: string | null): void => {
    if (state.isStreaming) {
      return;
    }
    setGameId(next);
    setVoiceFailure(null);
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
    stopAudio();
    cancel();
    voicePendingRef.current = false;
    setVoiceFailure(null);
    if (activeExchangeId !== null) {
      dropExchange(activeExchangeId);
      setActiveExchangeId(null);
    }
  };

  const handleReadAloudChange = (checked: boolean): void => {
    readAloudRef.current = checked;
    setReadAloud(checked);
    saveReadAloudPreference(checked);
    if (!checked) {
      stopAudio();
    }
  };

  const submitQuestion = (): void => {
    if (!canTextAsk || gameId === null) {
      return;
    }
    stopAudio();
    voicePendingRef.current = false;
    setVoiceFailure(null);
    const questionText = question.trim();
    const expansions = [...expansionIds];
    // Reuse skips the engine — and therefore Piper — so only do it when
    // the player is not asking for read-aloud on this turn.
    const reused =
      readAloudRef.current === true ? null : findReusableExchange(thread, questionText, expansions);
    const id = beginExchange({
      question: questionText,
      mode: 'arbitrate',
      expansionIds: expansions,
    });
    setActiveExchangeId(id);
    setQuestion('');
    if (reused !== null) {
      updateAnswer(id, freezeAnswer(reused.answer));
      setActiveExchangeId(null);
      return;
    }
    void ask(
      {
        gameId,
        question: questionText,
        mode: 'arbitrate',
        expansionIds: expansions.length > 0 ? expansions : undefined,
        speak: readAloudRef.current,
        locale,
      },
      { onAudio: enqueueIfReadAloud },
    );
  };

  const submitVoice = (wav: Blob): void => {
    if (!canVoiceAsk || gameId === null) {
      return;
    }
    stopAudio();
    voicePendingRef.current = true;
    setVoiceFailure(null);
    const id = beginExchange({
      question: t('rulesChat.voice.pendingQuestion'),
      mode: 'arbitrate',
      expansionIds: [...expansionIds],
    });
    setActiveExchangeId(id);
    void ask(
      {
        gameId,
        question: '.',
        mode: 'arbitrate',
        expansionIds: expansionIds.length > 0 ? expansionIds : undefined,
        speak: readAloudRef.current,
        locale,
      },
      {
        audio: wav,
        onAudio: enqueueIfReadAloud,
      },
    );
  };

  const holdToTalk = useHoldToTalk({
    disabled: !canVoiceAsk,
    onHoldStart: () => {
      stopAudio();
      cancel();
      voicePendingRef.current = false;
      setVoiceFailure(null);
      if (activeExchangeId !== null) {
        dropExchange(activeExchangeId);
        setActiveExchangeId(null);
      }
    },
    onRecordingComplete: submitVoice,
  });

  const onMicPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    holdToTalk.onPressStart();
  };

  const onMicPointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    holdToTalk.onPressEnd();
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
  let micHint: string | null = null;
  if (!holdToTalk.isSupported) {
    micHint = t('rulesChat.voice.unsupported');
  } else if (holdToTalk.errorCode === 'mic_denied') {
    micHint = t('rulesChat.voice.micDenied');
  } else if (holdToTalk.errorCode === 'mic_unavailable') {
    micHint = t('rulesChat.voice.micUnavailable');
  } else if (holdToTalk.errorCode === 'recording_empty') {
    micHint = t('rulesChat.voice.recordingEmpty');
  }

  return (
    <form onSubmit={onSubmit} aria-label={t('rulesChat.formLabel')}>
      <Stack gap="lg">
        <Fieldset legend={t('rulesChat.game.label')} variant="filled">
          <GamePicker
            description={t('rulesChat.game.description')}
            value={gameId}
            onChange={onBaseGameChange}
            locale={locale}
            games={games}
            basesOnly
            disabled={games === null || baseGames.length === 0 || picksLocked}
            placeholder={t('rulesChat.game.placeholder')}
            aria-describedby={expansionsCleared ? expansionsStatusId : undefined}
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

        {voiceFailure !== null && !state.isStreaming && activeExchangeId === null && (
          <AnswerPanel state={voiceFailure} />
        )}

        <Textarea
          label={t('rulesChat.question.label')}
          placeholder={t('rulesChat.question.placeholder')}
          value={question}
          onChange={handleQuestionChange}
          onKeyDown={onTextareaKeyDown}
          autosize
          minRows={2}
        />

        <Switch
          label={t('rulesChat.voice.readAloud')}
          checked={readAloud}
          onChange={(event) => {
            handleReadAloudChange(event.currentTarget.checked);
          }}
        />

        <Group>
          <Button type="submit" disabled={!canTextAsk} loading={state.isStreaming}>
            {t('rulesChat.submit')}
          </Button>
          <Button
            type="button"
            variant={holdToTalk.isHolding ? 'filled' : 'light'}
            disabled={!canVoiceAsk || !holdToTalk.isSupported}
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerUp}
            onLostPointerCapture={onMicPointerUp}
          >
            {holdToTalk.isHolding ? t('rulesChat.voice.holding') : t('rulesChat.voice.holdToTalk')}
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

        {micHint !== null && (
          <Text size="sm" c="dimmed" role="status">
            {micHint}
          </Text>
        )}

        {!lastSaveSucceeded && (
          <Text size="sm" c="dimmed" role="status">
            {t('rulesChat.thread.saveFailed')}
          </Text>
        )}
      </Stack>
    </form>
  );
};
