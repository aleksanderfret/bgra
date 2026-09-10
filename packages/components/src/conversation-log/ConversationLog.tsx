'use client';

import { AnswerPanel } from '@bga/components/answer-panel';
import type { ThreadExchange } from '@bga/utils/conversation-thread';
import { Stack, Text } from '@mantine/core';
import { type FC, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConversationLogProps {
  exchanges: ThreadExchange[];
}

interface ThreadTurnProps {
  exchange: ThreadExchange;
  playerLabel: string;
}

const ThreadTurn: FC<ThreadTurnProps> = ({ exchange, playerLabel }) => (
  <Stack gap="xs">
    <Text size="sm" c="dimmed">
      {playerLabel}
    </Text>
    <Text fw={600}>{exchange.question}</Text>
    <AnswerPanel state={exchange.answer} live={exchange.answer.isStreaming} />
  </Stack>
);

export const ConversationLog: FC<ConversationLogProps> = ({ exchanges }) => {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const playerLabel = t('rulesChat.thread.playerLabel');
  const last = exchanges[exchanges.length - 1];
  const scrollKey =
    last === undefined ? '' : `${last.id}:${last.answer.text.length}:${last.question}`;

  useEffect(() => {
    if (scrollKey === '') {
      return;
    }
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [scrollKey]);

  if (exchanges.length === 0) {
    return null;
  }

  return (
    <Stack gap="lg" role="log" aria-label={t('rulesChat.thread.regionLabel')}>
      {exchanges.map((exchange) => (
        <ThreadTurn key={exchange.id} exchange={exchange} playerLabel={playerLabel} />
      ))}
      <div ref={endRef} />
    </Stack>
  );
};
