'use client';

import { Alert, Badge, Box, Image, Paper, Stack, Text, Title } from '@mantine/core';
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
              defaultValue: t('notice.unknown'),
            })}
          </Text>
        </Paper>
      )}

      <Box role="log" aria-live="polite" aria-label={t('answer.regionLabel')}>
        {state.text.length > 0 && (
          <Paper withBorder p="md" radius="md">
            <Text style={{ whiteSpace: 'pre-wrap' }}>{state.text}</Text>
          </Paper>
        )}
      </Box>

      {figures.length > 0 && (
        <Stack gap="xs">
          <Title order={4}>{t('answer.figures.title')}</Title>
          {figures.map(({ source, src }) => (
            <Paper key={source.id} withBorder p="xs" radius="md">
              <Image
                src={src}
                alt={t('answer.figures.alt', {
                  document: source.documentTitle,
                  page: source.page ?? t('answer.figures.unknownPage'),
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
            {state.sources.map((source) => (
              <li key={source.id}>
                <Badge variant="light" title={source.excerpt}>
                  {t(`documentKind.${source.documentKind}`)}
                  {source.page !== null && t('answer.sources.page', { page: source.page })}
                </Badge>
              </li>
            ))}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
