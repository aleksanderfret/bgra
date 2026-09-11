/**
 * Wire contract. This file is the source of truth; Python mirrors it in
 * `rag_engine/contract.py`. `test_contract_parity.py` fails if they drift.
 */

/**
 * When documents disagree, later entries in `DOCUMENT_AUTHORITY` win.
 * Transcripts supply teaching style, never rules.
 */
export type DocumentKind = 'rulebook' | 'faq' | 'errata' | 'player_aid' | 'video_transcript';

export const DOCUMENT_AUTHORITY: readonly DocumentKind[] = [
  'video_transcript',
  'player_aid',
  'rulebook',
  'faq',
  'errata',
] as const;

/**
 * `gameId` is both the retrieval filter and a directory name under
 * `storage/assets`, so it stays a strict slug. `test_contract_parity.py`
 * checks this against the Python side.
 */
export const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Document keys reuse the same slug rules as game ids. */
export const DOC_KEY_PATTERN = GAME_ID_PATTERN;

export function isGameId(value: string): boolean {
  return GAME_ID_PATTERN.test(value);
}

export function isDocKey(value: string): boolean {
  return DOC_KEY_PATTERN.test(value);
}

/**
 * A retrieved chunk. The UI may show a figure only if its id is in this list
 * and `imageUrl` is set.
 */
export interface RetrievedSource {
  id: string;
  gameId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  /** 1-based; null for transcripts. */
  page: number | null;
  score: number;
  excerpt: string;
  /**
   * A path relative to the engine root (`/static/assets/...`), never an
   * absolute URL: the frontend prefixes it with its own proxy path (see D10).
   */
  imageUrl: string | null;
}

export type AnswerMode = 'teach' | 'arbitrate';

export interface AskRequest {
  /**
   * Required base (or standalone) game. Retrieval uses this id plus any
   * validated `expansionIds` — filter before search, never after.
   */
  gameId: string;
  question: string;
  mode: AnswerMode;
  sessionId?: string;
  /**
   * Expansion game ids whose `baseGameId` must equal `gameId`. Empty / omitted
   * means base rules only.
   */
  expansionIds?: string[];
  /** When true, the engine speaks completed sentences while tokens stream. */
  speak?: boolean;
  /** UI locale for the spoken voice (`en` or `pl`). */
  locale?: 'en' | 'pl';
}

export type PipelineStage =
  | 'planning'
  | 'transcribing'
  | 'retrieving'
  | 'reranking'
  | 'generating'
  | 'speaking';

/** `insufficient_evidence` is a valid answer, not an error. */
export type Groundedness = 'grounded' | 'partial' | 'insufficient_evidence';

/** Soft pedagogical spine labels — guidance for planning, not a fixed 5-slot lesson. */
export type LessonSpineHint = 'goal' | 'theme' | 'mechanics' | 'turn' | 'sample_move';

export type LessonSessionStatus = 'planning' | 'active' | 'paused' | 'completed' | 'expired';

export type LessonTurnKind = 'plan' | 'unit' | 'digression';

export interface LessonSyllabusUnit {
  unitId: string;
  title: string;
  sectionRefs: string[];
  spineHint?: LessonSpineHint | null;
}

export interface LessonTurn {
  id: string;
  kind: LessonTurnKind;
  unitId?: string | null;
  question?: string | null;
  text: string;
  sources: RetrievedSource[];
  groundedness: Groundedness;
}

/**
 * Server-owned teaching session. `sessionId` is issued by the engine (D13),
 * never chosen by the client.
 */
export interface LessonSession {
  sessionId: string;
  gameId: string;
  expansionIds: string[];
  syllabus: LessonSyllabusUnit[];
  unitIndex: number;
  status: LessonSessionStatus;
  updatedAt: string;
  expiresAt: string;
  turns: LessonTurn[];
}

export interface LessonStartRequest {
  gameId: string;
  expansionIds?: string[];
  speak?: boolean;
  locale?: 'en' | 'pl';
}

/** Continue, repeat, or resolve the active lesson by server-issued id. */
export interface LessonSessionRequest {
  sessionId: string;
  speak?: boolean;
  locale?: 'en' | 'pl';
}

export interface LessonAskRequest {
  sessionId: string;
  question: string;
  speak?: boolean;
  locale?: 'en' | 'pl';
}

export interface LessonActiveResponse {
  session: LessonSession | null;
}

export interface EnsureVoiceRequest {
  locale: 'en' | 'pl';
}

export interface EnsureVoiceResponse {
  ready: boolean;
  voice: string;
  locale: 'en' | 'pl';
}

export type AssistantEvent =
  | { type: 'status'; stage: PipelineStage }
  | { type: 'transcript'; text: string }
  /** Must arrive before the first token. */
  | { type: 'sources'; sources: RetrievedSource[] }
  | { type: 'token'; text: string }
  /** `sourceId` must exist in `sources` and that source must have an image. */
  | { type: 'figure'; sourceId: string }
  | { type: 'audio'; sequence: number; mimeType: string; dataBase64: string }
  | { type: 'notice'; code: string; params: Record<string, string> }
  | { type: 'done'; answerId: string; groundedness: Groundedness }
  /** `message` is an English log detail, never the sentence on screen. */
  | { type: 'error'; code: string; message: string };

export interface GameDocumentSummary {
  docKey: string;
  documentKind: DocumentKind;
  title: string;
  chunkCount: number;
  indexedAt: string;
}

export interface GameSummary {
  gameId: string;
  title: string;
  /** 0 means registered but not ingested. */
  chunkCount: number;
  documentKinds: DocumentKind[];
  indexedAt: string | null;
  /** Null for a base or standalone game; set on expansions. */
  baseGameId: string | null;
  documents: GameDocumentSummary[];
}

/** Blocking splash stages while the assistant warms (null when Ask-ready). */
export type WarmStage = 'starting_assistant' | 'teaching_answers' | 'finding_rules';

export interface HealthReport {
  status: 'ok' | 'degraded';
  components: Record<string, boolean>;
  models: Record<string, string>;
  missingModels: string[];
  /** Null once blocking warm finished (or never started). */
  warmStage: WarmStage | null;
}

/** Slim row for game pickers (no documents / chunk counts). */
export interface GameCatalogueItem {
  gameId: string;
  title: string;
  baseGameId: string | null;
}

export interface RetrievalReloadResponse {
  started: boolean;
}

export type IngestStage = 'saving' | 'reading' | 'drawing' | 'filing' | 'community' | 'indexing';

export type IngestEvent =
  | {
      type: 'ingest_progress';
      stage: IngestStage;
      current: number | null;
      total: number | null;
      percent: number;
    }
  | { type: 'ingest_done'; game: GameSummary }
  | { type: 'error'; code: string; message: string };
