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
] as const;

export const NOTICE_CODES = ['engine_not_indexed'] as const;
