/**
 * Codes this build knows how to phrase. The engine may send a new one first;
 * the UI falls back rather than printing `stream_truncated` mid-game.
 * `codes.test.ts` fails if a code listed here has no wording in either locale.
 */

export const ERROR_CODES = [
  'engine_unreachable',
  'stream_truncated',
  'http_error',
  'malformed_frame',
  'unknown_event',
  'generation_timeout',
  'model_missing',
  'speech_unavailable',
  'speech_failed',
] as const;

export const NOTICE_CODES = [
  'engine_not_indexed',
  'search_catch_up_needed',
  'retrieval_not_ready',
  'retrieval_loading',
  'checking_sources_carefully',
  'preparing_assistant',
  'sources_disagree',
  'speech_empty',
  'speech_invalid_audio',
] as const;
