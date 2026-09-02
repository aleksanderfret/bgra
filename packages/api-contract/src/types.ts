/**
 * The wire contract between `apps/web` and `services/rag-engine`.
 *
 * This file is the single source of truth for the shapes that cross the
 * process boundary. The Python side mirrors it with pydantic models in
 * `services/rag-engine/rag_engine/contract.py`; the parity test in
 * `services/rag-engine/tests/test_contract_parity.py` fails if they drift.
 */

/**
 * Where a piece of retrieved knowledge came from.
 *
 * Precedence matters when documents disagree: an errata sheet overrides a FAQ,
 * which overrides the printed rulebook. `video_transcript` never establishes a
 * rule — it only supplies teaching style and wording.
 */
export type DocumentKind = 'rulebook' | 'faq' | 'errata' | 'player_aid' | 'video_transcript';

/** Documents ordered from lowest to highest authority. */
export const DOCUMENT_AUTHORITY: readonly DocumentKind[] = [
  'video_transcript',
  'player_aid',
  'rulebook',
  'faq',
  'errata',
] as const;

/**
 * A chunk the retriever actually returned.
 *
 * The backend mints these ids and the frontend renders only what it receives
 * here. A figure the model "remembers" but that is absent from this list can
 * never reach the screen.
 */
export interface RetrievedSource {
  /** Stable, backend-minted id, e.g. `azul:rulebook:p04:c02`. */
  id: string;
  gameId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  /** 1-based page in the source document; null for transcripts. */
  page: number | null;
  /** Fused retrieval score after reranking, higher is better. */
  score: number;
  /** Verbatim text of the chunk, used for the citation popover. */
  excerpt: string;
  /** Backend-served image for this chunk (page render or figure crop). */
  imageUrl: string | null;
}

/** How the assistant should behave for a given question. */
export type AnswerMode =
  /** Walk the player through the game step by step, checking understanding. */
  | 'teach'
  /** Settle a dispute mid-game: short, exact, always cite the page. */
  | 'arbitrate';

export interface AskRequest {
  /**
   * Required. Retrieval is always scoped to one game — without this filter a
   * question about "the combat phase" pulls chunks from every game you own.
   */
  gameId: string;
  question: string;
  mode: AnswerMode;
  /** Groups turns into one teaching session so the model keeps its place. */
  sessionId?: string;
}

/** Long-running work the UI reports while the user waits. */
export type PipelineStage = 'transcribing' | 'retrieving' | 'reranking' | 'generating' | 'speaking';

/**
 * Whether the answer is actually backed by the retrieved documents.
 *
 * `insufficient_evidence` is a first-class outcome, not a failure: for a rules
 * arbiter, "the rulebook does not cover this" is the correct answer far more
 * often than a confident guess.
 */
export type Groundedness = 'grounded' | 'partial' | 'insufficient_evidence';

export type AssistantEvent =
  /** Progress ping so the UI can show which stage is running. */
  | { type: 'status'; stage: PipelineStage }
  /** What speech-to-text heard, so the user can catch mishearings. */
  | { type: 'transcript'; text: string }
  /** Always emitted before the first token: the evidence the answer may use. */
  | { type: 'sources'; sources: RetrievedSource[] }
  /** One increment of the answer text. */
  | { type: 'token'; text: string }
  /** The model pointed at a figure; `sourceId` must exist in `sources`. */
  | { type: 'figure'; sourceId: string }
  /** Base64 audio from text-to-speech, ordered by `sequence`. */
  | { type: 'audio'; sequence: number; mimeType: string; dataBase64: string }
  | { type: 'done'; answerId: string; groundedness: Groundedness }
  | { type: 'error'; code: string; message: string };

export interface GameSummary {
  gameId: string;
  title: string;
  /** Number of indexed chunks; 0 means the game is registered but not ingested. */
  chunkCount: number;
  documentKinds: DocumentKind[];
  /** ISO-8601 timestamp of the last successful ingestion. */
  indexedAt: string | null;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  /** Which local engines answered a probe, e.g. `{ llm: true, stt: false }`. */
  components: Record<string, boolean>;
  /** Model ids actually loaded, so the UI never guesses. */
  models: Record<string, string>;
}
