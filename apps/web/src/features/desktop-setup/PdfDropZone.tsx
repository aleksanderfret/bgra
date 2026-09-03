'use client';

import { isGameId } from '@bga/api-contract';
import { Alert, Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File): void => {
    const api = getDesktopApi();
    if (api === null) {
      setFeedback({ kind: 'browser_only' });
      return;
    }

    if (!isGameId(gameId)) {
      setFeedback({ kind: 'invalid_game_id' });
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }

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

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files.item(0);
    if (file !== null) {
      handleFile(file);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.item(0);
    if (file !== null && file !== undefined) {
      handleFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const gameIdError =
    feedback.kind === 'invalid_game_id' ? t('pdfImport.error.invalidGameIdBody') : undefined;

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
        error={gameIdError}
        required
      />

      <Alert
        variant={dragging ? 'filled' : 'light'}
        color={dragging ? 'teal' : 'gray'}
        title={t('pdfImport.drop.title')}
        role="region"
        aria-label={t('pdfImport.drop.title')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        styles={{ root: { minHeight: 120, cursor: 'copy' } }}
      >
        <Stack gap="sm">
          <Text>{t('pdfImport.drop.body')}</Text>
          <Group>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              style={{ display: 'none' }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <Button variant="light" size="sm" onClick={() => fileInputRef.current?.click()}>
              {t('pdfImport.drop.title')}
            </Button>
          </Group>
        </Stack>
      </Alert>

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
