/**
 * The engine codes this build knows how to phrase.
 *
 * Codes are an open set — the engine can start sending one before the frontend
 * has been taught the word for it — so the components fall back rather than
 * putting `stream_truncated` in front of somebody mid-game. This list is the
 * other half of that arrangement: `codes.test.ts` fails if anything named here
 * is missing wording in either language, which is what keeps the fallback rare
 * instead of routine.
 */

export const ERROR_CODES = [
  'engine_unreachable',
  'stream_truncated',
  'http_error',
  'malformed_frame',
  'unknown_event',
] as const;

export const NOTICE_CODES = ['engine_not_indexed'] as const;
