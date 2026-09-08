'use client';

import { type GameSummary, isGameId } from '@bga/api-contract';
import {
  Alert,
  Button,
  Checkbox,
  Fieldset,
  FileButton,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  type ChangeEvent,
  type DragEvent,
  type FC,
  type ReactElement,
  type SubmitEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useEngineReadiness } from '@/features/engine-readiness/useEngineReadiness';
import { GAMES_CHANGED_EVENT } from '@/lib/desktop-bridge';
import { isGameSummaryList } from '@/lib/game-summary';

type ImportMode = 'create' | 'attach';

type ImportFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid_game_id' }
  | { kind: 'unknown_game' }
  | { kind: 'invalid_document_title' }
  | { kind: 'invalid_base_game' }
  | { kind: 'invalid_doc_key' }
  | { kind: 'invalid_file' }
  | { kind: 'ingest_not_ready'; fileName: string }
  | { kind: 'engine_unreachable' }
  | { kind: 'limit_exceeded' }
  | { kind: 'page_image_too_large' }
  | { kind: 'ingest_failed' }
  | { kind: 'index_failed' }
  | { kind: 'index_retry_success' }
  | { kind: 'ingest_busy' }
  | { kind: 'success'; gameId: string; documentTitle: string; attached: boolean };

interface EngineErrorEvent {
  type: 'error';
  code: string;
}

interface FileButtonRenderProps {
  onClick: () => void;
}

const isEngineErrorEvent = (value: unknown): value is EngineErrorEvent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return (
    'type' in value && value.type === 'error' && 'code' in value && typeof value.code === 'string'
  );
};

const engineErrorCode = (payload: unknown): string | null =>
  isEngineErrorEvent(payload) ? payload.code : null;

const isImportMode = (value: string): value is ImportMode =>
  value === 'create' || value === 'attach';

export const PdfDropZone: FC = () => {
  const { t } = useTranslation();
  const headingId = useId();
  const dropTitleId = useId();
  const dropHintId = useId();
  const [mode, setMode] = useState<ImportMode>('create');
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [gameId, setGameId] = useState('');
  const [attachGameId, setAttachGameId] = useState<string | null>(null);
  const [gameTitle, setGameTitle] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [baseGameId, setBaseGameId] = useState<string | null>(null);
  const [fetchCommunityFaq, setFetchCommunityFaq] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const enginePhase = useEngineReadiness();
  const gameIdRef = useRef<HTMLInputElement>(null);
  const documentTitleRef = useRef<HTMLInputElement>(null);
  const resetFileRef = useRef<() => void>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
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

  const baseGames = (games ?? []).filter((game) => game.baseGameId === null);
  const importAllowed = enginePhase === 'ready';
  const controlsDisabled = busy || !importAllowed;

  const handleFile = (file: File | null): void => {
    if (file === null || !importAllowed) {
      return;
    }

    const resolvedGameId = mode === 'attach' ? (attachGameId ?? '') : gameId;
    const resolvedDocumentTitle =
      mode === 'attach'
        ? documentTitle.trim()
        : documentTitle.trim() || t('pdfImport.documentTitle.placeholder');

    if (mode === 'create' && !isGameId(resolvedGameId)) {
      setFeedback({ kind: 'invalid_game_id' });
      queueMicrotask(() => gameIdRef.current?.focus());
      return;
    }

    if (mode === 'attach' && (attachGameId === null || !isGameId(attachGameId))) {
      setFeedback({ kind: 'unknown_game' });
      return;
    }

    if (mode === 'attach' && resolvedDocumentTitle.length === 0) {
      setFeedback({ kind: 'invalid_document_title' });
      queueMicrotask(() => documentTitleRef.current?.focus());
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFeedback({ kind: 'invalid_file' });
      return;
    }

    const form = new FormData();
    form.set('file', file);
    form.set('gameId', resolvedGameId);
    form.set('mode', mode);
    form.set('documentTitle', resolvedDocumentTitle);
    form.set('fetchCommunityFaq', fetchCommunityFaq ? 'true' : 'false');
    if (mode === 'create') {
      form.set('title', gameTitle.trim() || resolvedGameId);
      if (baseGameId !== null) {
        form.set('baseGameId', baseGameId);
      }
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setBusy(true);
    setFeedback({ kind: 'idle' });
    void fetch('/api/engine/ingest/pdf', { method: 'POST', body: form, signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (response.ok) {
          setFeedback({
            kind: 'success',
            gameId: resolvedGameId,
            documentTitle: resolvedDocumentTitle,
            attached: mode === 'attach',
          });
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
        if (code === 'unknown_game') {
          setFeedback({ kind: 'unknown_game' });
          return;
        }
        if (code === 'invalid_document_title') {
          setFeedback({ kind: 'invalid_document_title' });
          queueMicrotask(() => documentTitleRef.current?.focus());
          return;
        }
        if (code === 'invalid_base_game') {
          setFeedback({ kind: 'invalid_base_game' });
          return;
        }
        if (code === 'invalid_doc_key') {
          setFeedback({ kind: 'invalid_doc_key' });
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
        if (code === 'page_image_too_large') {
          setFeedback({ kind: 'page_image_too_large' });
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
        if (code === 'index_failed') {
          setFeedback({ kind: 'index_failed' });
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

  const handleRetryIndex = (): void => {
    if (!importAllowed || busy) {
      return;
    }
    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setBusy(true);
    void fetch('/api/engine/ingest/reindex', {
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (response.ok) {
          setFeedback({ kind: 'index_retry_success' });
          window.dispatchEvent(new Event(GAMES_CHANGED_EVENT));
          return;
        }
        const code =
          engineErrorCode(payload) ?? (response.status === 502 ? 'engine_unreachable' : '');
        if (code === 'ingest_busy') {
          setFeedback({ kind: 'ingest_busy' });
          return;
        }
        if (code === 'engine_unreachable') {
          setFeedback({ kind: 'engine_unreachable' });
          return;
        }
        setFeedback({ kind: 'index_failed' });
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
        uploadAbortRef.current = null;
      });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    if (controlsDisabled) {
      return;
    }

    const file = event.dataTransfer.files.item(0);
    if (file !== null) {
      handleFile(file);
    }
  };

  const gameIdError =
    feedback.kind === 'invalid_game_id' ? t('pdfImport.error.invalidGameIdBody') : undefined;
  const documentTitleError =
    feedback.kind === 'invalid_document_title'
      ? t('pdfImport.error.invalidDocumentTitleBody')
      : undefined;

  const handleFormSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
  };

  const handleModeChange = (value: string): void => {
    if (isImportMode(value)) {
      setMode(value);
      setFeedback({ kind: 'idle' });
    }
  };

  const handleGameIdChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setGameId(event.currentTarget.value);
  };

  const handleGameTitleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setGameTitle(event.currentTarget.value);
  };

  const handleDocumentTitleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDocumentTitle(event.currentTarget.value);
  };

  const handleCommunityFaqChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setFetchCommunityFaq(event.currentTarget.checked);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!controlsDisabled) {
      setDragging(true);
    }
  };

  const handleDragLeave = (): void => {
    setDragging(false);
  };

  const renderChooseFileButton = (props: FileButtonRenderProps): ReactElement => (
    <Button
      {...props}
      type="button"
      variant="light"
      size="sm"
      loading={busy}
      disabled={controlsDisabled}
    >
      {t('pdfImport.drop.chooseFile')}
    </Button>
  );

  return (
    <form aria-labelledby={headingId} aria-busy={busy} onSubmit={handleFormSubmit}>
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={2} id={headingId}>
            {t('pdfImport.title')}
          </Title>
          <Text c="dimmed" size="sm">
            {t('pdfImport.subtitle')}
          </Text>
        </Stack>

        <Fieldset legend={t('pdfImport.howAdding.legend')} variant="filled">
          <Stack gap="sm">
            <Text size="sm">{t('pdfImport.howAdding.helper')}</Text>
            <SegmentedControl
              value={mode}
              onChange={handleModeChange}
              data={[
                { value: 'create', label: t('pdfImport.howAdding.create') },
                { value: 'attach', label: t('pdfImport.howAdding.attach') },
              ]}
              disabled={controlsDisabled}
              fullWidth
            />
          </Stack>
        </Fieldset>

        {mode === 'create' ? (
          <Fieldset legend={t('pdfImport.newGame.legend')} variant="filled">
            <Stack gap="sm">
              <TextInput
                ref={gameIdRef}
                label={t('pdfImport.gameId.label')}
                description={t('pdfImport.gameId.description')}
                placeholder={t('pdfImport.gameId.placeholder')}
                value={gameId}
                onChange={handleGameIdChange}
                error={gameIdError}
                required
                disabled={controlsDisabled}
              />
              <TextInput
                label={t('pdfImport.gameTitle.label')}
                description={t('pdfImport.gameTitle.description')}
                placeholder={t('pdfImport.gameTitle.placeholder')}
                value={gameTitle}
                onChange={handleGameTitleChange}
                disabled={controlsDisabled}
              />
              <Select
                label={t('pdfImport.baseGame.label')}
                description={t('pdfImport.baseGame.description')}
                placeholder={t('pdfImport.baseGame.placeholder')}
                data={baseGames.map((game) => ({ value: game.gameId, label: game.title }))}
                value={baseGameId}
                onChange={setBaseGameId}
                disabled={controlsDisabled || games === null}
                clearable
                searchable
              />
              <TextInput
                ref={documentTitleRef}
                label={t('pdfImport.documentTitle.label')}
                description={t('pdfImport.documentTitle.description')}
                placeholder={t('pdfImport.documentTitle.placeholder')}
                value={documentTitle}
                onChange={handleDocumentTitleChange}
                disabled={controlsDisabled}
              />
              <Checkbox
                label={t('pdfImport.communityFaq.label')}
                description={t('pdfImport.communityFaq.description')}
                checked={fetchCommunityFaq}
                onChange={handleCommunityFaqChange}
                disabled={controlsDisabled}
              />
            </Stack>
          </Fieldset>
        ) : (
          <Fieldset legend={t('pdfImport.attachGame.legend')} variant="filled">
            <Stack gap="sm">
              <Select
                label={t('pdfImport.attachGame.selectLabel')}
                description={t('pdfImport.attachGame.selectDescription')}
                placeholder={
                  games === null
                    ? t('pdfImport.attachGame.loading')
                    : t('pdfImport.attachGame.selectPlaceholder')
                }
                data={(games ?? []).map((game) => ({ value: game.gameId, label: game.title }))}
                value={attachGameId}
                onChange={setAttachGameId}
                disabled={controlsDisabled || games === null || games.length === 0}
                searchable
                error={
                  feedback.kind === 'unknown_game'
                    ? t('pdfImport.error.unknownGameBody')
                    : undefined
                }
              />
              <TextInput
                ref={documentTitleRef}
                label={t('pdfImport.documentTitle.label')}
                description={t('pdfImport.documentTitle.requiredAttach')}
                placeholder={t('pdfImport.documentTitle.placeholder')}
                value={documentTitle}
                onChange={handleDocumentTitleChange}
                error={documentTitleError}
                required
                disabled={controlsDisabled}
              />
            </Stack>
          </Fieldset>
        )}

        <Fieldset legend={t('pdfImport.drop.legend')} variant="filled">
          <Paper
            withBorder
            p="md"
            radius="md"
            aria-labelledby={dropTitleId}
            aria-describedby={dropHintId}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={onDrop}
            bg={dragging ? 'var(--mantine-color-teal-light)' : undefined}
            style={{ minHeight: 120, cursor: controlsDisabled ? 'not-allowed' : 'copy' }}
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
                  disabled={controlsDisabled}
                  onChange={handleFile}
                  inputProps={{ 'aria-label': t('pdfImport.drop.chooseFile') }}
                >
                  {renderChooseFileButton}
                </FileButton>
              </Group>
            </Stack>
          </Paper>
        </Fieldset>

        {feedback.kind === 'success' && (
          <Alert color="teal" title={t('pdfImport.success.title')} role="status" aria-live="polite">
            {feedback.attached
              ? t('pdfImport.success.attachedBody', {
                  gameId: feedback.gameId,
                  documentTitle: feedback.documentTitle,
                })
              : t('pdfImport.success.body', { gameId: feedback.gameId })}
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
        {feedback.kind === 'unknown_game' && mode === 'create' && (
          <Alert color="red" title={t('pdfImport.error.unknownGameTitle')} role="alert">
            {t('pdfImport.error.unknownGameBody')}
          </Alert>
        )}
        {feedback.kind === 'invalid_base_game' && (
          <Alert color="red" title={t('pdfImport.error.invalidBaseGameTitle')} role="alert">
            {t('pdfImport.error.invalidBaseGameBody')}
          </Alert>
        )}
        {feedback.kind === 'invalid_doc_key' && (
          <Alert color="red" title={t('pdfImport.error.invalidDocKeyTitle')} role="alert">
            {t('pdfImport.error.invalidDocKeyBody')}
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
        {feedback.kind === 'page_image_too_large' && (
          <Alert color="red" title={t('pdfImport.error.pageImageTooLargeTitle')} role="alert">
            {t('pdfImport.error.pageImageTooLargeBody')}
          </Alert>
        )}
        {feedback.kind === 'ingest_failed' && (
          <Alert color="red" title={t('pdfImport.error.ingestFailedTitle')} role="alert">
            {t('pdfImport.error.ingestFailedBody')}
          </Alert>
        )}
        {feedback.kind === 'index_failed' && (
          <Alert color="orange" title={t('pdfImport.error.indexFailedTitle')} role="alert">
            <Stack gap="sm">
              <Text size="sm">{t('pdfImport.error.indexFailedBody')}</Text>
              <Button
                type="button"
                variant="light"
                size="sm"
                loading={busy}
                disabled={!importAllowed}
                onClick={handleRetryIndex}
              >
                {t('pdfImport.error.indexFailedRetry')}
              </Button>
            </Stack>
          </Alert>
        )}
        {feedback.kind === 'index_retry_success' && (
          <Alert
            color="teal"
            title={t('pdfImport.error.indexRetrySuccessTitle')}
            role="status"
            aria-live="polite"
          >
            {t('pdfImport.error.indexRetrySuccessBody')}
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
};
