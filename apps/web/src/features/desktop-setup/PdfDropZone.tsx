'use client';

import { isGameId } from '@bga/api-contract';
import {
  Alert,
  Button,
  Checkbox,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES_CHANGED_EVENT } from '@/lib/desktop-bridge';

type ImportFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid_game_id' }
  | { kind: 'invalid_file' }
  | { kind: 'ingest_not_ready'; fileName: string }
  | { kind: 'engine_unreachable' }
  | { kind: 'limit_exceeded' }
  | { kind: 'ingest_failed' }
  | { kind: 'ingest_busy' }
  | { kind: 'success'; gameId: string };

type EngineErrorBody = { type?: string; code?: string };

function engineErrorCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const body = payload as EngineErrorBody;
  if (body.type === 'error' && typeof body.code === 'string') {
    return body.code;
  }
  return null;
}

export function PdfDropZone() {
  const { t } = useTranslation();
  const headingId = useId();
  const dropTitleId = useId();
  const dropHintId = useId();
  const [gameId, setGameId] = useState('');
  const [gameTitle, setGameTitle] = useState('');
  const [fetchCommunityFaq, setFetchCommunityFaq] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const gameIdRef = useRef<HTMLInputElement>(null);
  const resetFileRef = useRef<() => void>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  const handleFile = (file: File | null): void => {
    if (file === null) {
      return;
    }

    if (!isGameId(gameId)) {
      setFeedback({ kind: 'invalid_game_id' });
      queueMicrotask(() => gameIdRef.current?.focus());
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFeedback({ kind: 'invalid_file' });
      return;
    }

    const form = new FormData();
    form.set('file', file);
    form.set('gameId', gameId);
    form.set('title', gameTitle.trim() || gameId);
    form.set('fetchCommunityFaq', fetchCommunityFaq ? 'true' : 'false');

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setBusy(true);
    setFeedback({ kind: 'idle' });
    void fetch('/api/engine/ingest/pdf', { method: 'POST', body: form, signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (response.ok) {
          setFeedback({ kind: 'success', gameId });
          window.dispatchEvent(new Event(GAMES_CHANGED_EVENT));
          return;
        }
        const code =
          engineErrorCode(payload) ?? (response.status === 502 ? 'engine_unreachable' : '');
        if (code === 'invalid_game_id') {
          setFeedback({ kind: 'invalid_game_id' });
          queueMicrotask(() => gameIdRef.current?.focus());
          return;
        }
        if (code === 'invalid_file') {
          setFeedback({ kind: 'invalid_file' });
          return;
        }
        if (code === 'ingest_not_ready') {
          setFeedback({ kind: 'ingest_not_ready', fileName: file.name });
          return;
        }
        if (code === 'limit_exceeded') {
          setFeedback({ kind: 'limit_exceeded' });
          return;
        }
        if (code === 'engine_unreachable') {
          setFeedback({ kind: 'engine_unreachable' });
          return;
        }
        if (code === 'ingest_busy') {
          setFeedback({ kind: 'ingest_busy' });
          return;
        }
        setFeedback({ kind: 'ingest_failed' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setFeedback({ kind: 'engine_unreachable' });
      })
      .finally(() => {
        if (uploadAbortRef.current !== controller) {
          return;
        }
        setBusy(false);
        resetFileRef.current?.();
        uploadAbortRef.current = null;
      });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    if (busy) {
      return;
    }

    const file = event.dataTransfer.files.item(0);
    if (file !== null) {
      handleFile(file);
    }
  };

  const gameIdError =
    feedback.kind === 'invalid_game_id' ? t('pdfImport.error.invalidGameIdBody') : undefined;

  return (
    <form aria-labelledby={headingId} aria-busy={busy} onSubmit={(event) => event.preventDefault()}>
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={2} id={headingId}>
            {t('pdfImport.title')}
          </Title>
          <Text c="dimmed" size="sm">
            {t('pdfImport.subtitle')}
          </Text>
        </Stack>

        <TextInput
          ref={gameIdRef}
          label={t('pdfImport.gameId.label')}
          description={t('pdfImport.gameId.description')}
          placeholder={t('pdfImport.gameId.placeholder')}
          value={gameId}
          onChange={(event) => setGameId(event.currentTarget.value)}
          error={gameIdError}
          required
          disabled={busy}
        />

        <TextInput
          label={t('pdfImport.gameTitle.label')}
          description={t('pdfImport.gameTitle.description')}
          placeholder={t('pdfImport.gameTitle.placeholder')}
          value={gameTitle}
          onChange={(event) => setGameTitle(event.currentTarget.value)}
          disabled={busy}
        />

        <Checkbox
          label={t('pdfImport.communityFaq.label')}
          description={t('pdfImport.communityFaq.description')}
          checked={fetchCommunityFaq}
          onChange={(event) => setFetchCommunityFaq(event.currentTarget.checked)}
          disabled={busy}
        />

        <Paper
          withBorder
          p="md"
          radius="md"
          role="group"
          aria-labelledby={dropTitleId}
          aria-describedby={dropHintId}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) {
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          bg={dragging ? 'var(--mantine-color-teal-light)' : undefined}
          style={{ minHeight: 120, cursor: busy ? 'wait' : 'copy' }}
        >
          <Stack gap="sm">
            <Text id={dropTitleId} fw={600}>
              {t('pdfImport.drop.title')}
            </Text>
            <Text
              id={dropHintId}
              size="sm"
              role={busy ? 'status' : undefined}
              aria-live={busy ? 'polite' : undefined}
            >
              {busy ? t('pdfImport.busy') : t('pdfImport.drop.body')}{' '}
              {t('pdfImport.drop.keyboardHint')}
            </Text>
            <Group>
              <FileButton
                resetRef={resetFileRef}
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={handleFile}
                inputProps={{ 'aria-label': t('pdfImport.drop.chooseFile') }}
              >
                {(props) => (
                  <Button {...props} type="button" variant="light" size="sm" loading={busy}>
                    {t('pdfImport.drop.chooseFile')}
                  </Button>
                )}
              </FileButton>
            </Group>
          </Stack>
        </Paper>

        {feedback.kind === 'success' && (
          <Alert color="teal" title={t('pdfImport.success.title')} role="status" aria-live="polite">
            {t('pdfImport.success.body', { gameId: feedback.gameId })}
          </Alert>
        )}
        {feedback.kind === 'ingest_not_ready' && (
          <Alert color="orange" title={t('pdfImport.error.ingestNotReadyTitle')} role="alert">
            {t('pdfImport.error.ingestNotReadyBody', { fileName: feedback.fileName })}
          </Alert>
        )}
        {feedback.kind === 'invalid_file' && (
          <Alert color="red" title={t('pdfImport.error.invalidFileTitle')} role="alert">
            {t('pdfImport.error.invalidFileBody')}
          </Alert>
        )}
        {feedback.kind === 'engine_unreachable' && (
          <Alert color="red" title={t('pdfImport.error.engineUnreachableTitle')} role="alert">
            {t('pdfImport.error.engineUnreachableBody')}
          </Alert>
        )}
        {feedback.kind === 'limit_exceeded' && (
          <Alert color="red" title={t('pdfImport.error.limitExceededTitle')} role="alert">
            {t('pdfImport.error.limitExceededBody')}
          </Alert>
        )}
        {feedback.kind === 'ingest_failed' && (
          <Alert color="red" title={t('pdfImport.error.ingestFailedTitle')} role="alert">
            {t('pdfImport.error.ingestFailedBody')}
          </Alert>
        )}
        {feedback.kind === 'ingest_busy' && (
          <Alert color="orange" title={t('pdfImport.error.ingestBusyTitle')} role="alert">
            {t('pdfImport.error.ingestBusyBody')}
          </Alert>
        )}
      </Stack>
    </form>
  );
}
