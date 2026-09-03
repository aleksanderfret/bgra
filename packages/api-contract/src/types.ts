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

export function isGameId(value: string): boolean {
  return GAME_ID_PATTERN.test(value);
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
  /** Required: retrieval is scoped to one game before search, never after. */
  gameId: string;
  question: string;
  mode: AnswerMode;
  sessionId?: string;
}

export type PipelineStage = 'transcribing' | 'retrieving' | 'reranking' | 'generating' | 'speaking';

/** `insufficient_evidence` is a valid answer, not an error. */
export type Groundedness = 'grounded' | 'partial' | 'insufficient_evidence';

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

export interface GameSummary {
  gameId: string;
  title: string;
  /** 0 means registered but not ingested. */
  chunkCount: number;
  documentKinds: DocumentKind[];
  indexedAt: string | null;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  components: Record<string, boolean>;
  models: Record<string, string>;
  missingModels: string[];
}
