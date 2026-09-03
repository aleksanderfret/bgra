'use client';

import { isGameId } from '@bga/api-contract';
import { Alert, Stack, Text, TextInput, Title } from '@mantine/core';
import { type DragEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDesktopApi } from '@/lib/desktop-bridge';

type ImportFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid_game_id' }
  | { kind: 'ingest_not_ready'; fileName: string }
  | { kind: 'browser_only' };

interface FileWithPath extends File {
  readonly path?: string;
}

function absolutePathOf(file: File): string | null {
  const candidate = (file as FileWithPath).path;
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }
  return null;
}

export function PdfDropZone() {
  const { t } = useTranslation();
  const [gameId, setGameId] = useState('');
  const [feedback, setFeedback] = useState<ImportFeedback>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);

    const api = getDesktopApi();
    if (api === null) {
      setFeedback({ kind: 'browser_only' });
      return;
    }

    if (!isGameId(gameId)) {
      setFeedback({ kind: 'invalid_game_id' });
      return;
    }

    const file = event.dataTransfer.files.item(0);
    if (file === null || !file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }

    // Electron exposes the absolute path; browsers do not.
    const filePath = absolutePathOf(file);
    if (filePath === null) {
      setFeedback({ kind: 'browser_only' });
      return;
    }

    void api.importPdf({ filePath, gameId }).then((result) => {
      if (!result.ok && result.reason === 'ingest_not_ready') {
        setFeedback({ kind: 'ingest_not_ready', fileName: file.name });
      } else if (!result.ok) {
        setFeedback({ kind: 'invalid_game_id' });
      }
    });
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3}>{t('pdfImport.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('pdfImport.subtitle')}
        </Text>
      </Stack>

      <TextInput
        label={t('pdfImport.gameId.label')}
        description={t('pdfImport.gameId.description')}
        placeholder={t('pdfImport.gameId.placeholder')}
        value={gameId}
        onChange={(event) => setGameId(event.currentTarget.value)}
      />

      <Alert
        variant={dragging ? 'filled' : 'light'}
        color={dragging ? 'teal' : 'gray'}
        title={t('pdfImport.drop.title')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        styles={{ root: { minHeight: 120, cursor: 'copy' } }}
      >
        {t('pdfImport.drop.body')}
      </Alert>

      {feedback.kind === 'invalid_game_id' && (
        <Alert color="red" title={t('pdfImport.error.invalidGameIdTitle')}>
          {t('pdfImport.error.invalidGameIdBody')}
        </Alert>
      )}
      {feedback.kind === 'ingest_not_ready' && (
        <Alert color="orange" title={t('pdfImport.error.ingestNotReadyTitle')}>
          {t('pdfImport.error.ingestNotReadyBody', { fileName: feedback.fileName })}
        </Alert>
      )}
      {feedback.kind === 'browser_only' && (
        <Alert color="blue" title={t('pdfImport.error.browserOnlyTitle')}>
          {t('pdfImport.error.browserOnlyBody')}
        </Alert>
      )}
    </Stack>
  );
}
