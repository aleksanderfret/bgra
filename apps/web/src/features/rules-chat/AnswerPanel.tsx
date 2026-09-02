'use client';

import { Alert, Badge, Group, Image, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { type AnswerState, selectVisibleFigures } from './answer-state';

export interface AnswerPanelProps {
  state: AnswerState;
}

export function AnswerPanel({ state }: AnswerPanelProps) {
  const { t } = useTranslation();
  const figures = selectVisibleFigures(state);

  if (state.error !== null) {
    return (
      <Alert color="red" title={t('answer.error.title')} role="alert">
        <Stack gap={4}>
          <Text size="sm">
            {t(`answer.error.${state.error.code}`, { defaultValue: t('answer.error.unknown') })}
          </Text>
          {/* The raw message is a diagnostic, not copy: it stays in English and
              in a quieter register than the sentence above it. */}
          <Text size="xs" c="dimmed">
            {state.error.message}
          </Text>
        </Stack>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {state.transcript !== null && (
        <Text size="sm" c="dimmed">
          {t('answer.transcript', { transcript: state.transcript })}
        </Text>
      )}

      {state.groundedness === 'insufficient_evidence' && (
        <Alert color="yellow" title={t('answer.insufficientEvidence.title')} role="alert">
          {t('answer.insufficientEvidence.body')}
        </Alert>
      )}

      {state.notice !== null && (
        <Paper withBorder p="md" radius="md">
          <Text style={{ whiteSpace: 'pre-wrap' }}>
            {t(`notice.${state.notice.code}`, {
              ...state.notice.params,
              // Codes are an open set: the engine can send one this build has
              // no wording for, and the raw code must not reach the screen.
              defaultValue: t('notice.unknown'),
            })}
          </Text>
        </Paper>
      )}

      {state.text.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text style={{ whiteSpace: 'pre-wrap' }}>{state.text}</Text>
        </Paper>
      )}

      {figures.length > 0 && (
        <Stack gap="xs">
          <Title order={4}>{t('answer.figures.title')}</Title>
          {figures.map((figure) => (
            <Paper key={figure.id} withBorder p="xs" radius="md">
              <Image
                src={figure.imageUrl}
                alt={t('answer.figures.alt', {
                  document: figure.documentTitle,
                  page: figure.page ?? t('answer.figures.unknownPage'),
                })}
                radius="sm"
              />
            </Paper>
          ))}
        </Stack>
      )}

      {state.sources.length > 0 && (
        <Stack gap="xs">
          <Title order={5}>{t('answer.sources.title')}</Title>
          <Group gap="xs">
            {state.sources.map((source) => (
              <Badge key={source.id} variant="light" title={source.excerpt}>
                {t(`documentKind.${source.documentKind}`)}
                {source.page !== null && t('answer.sources.page', { page: source.page })}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
