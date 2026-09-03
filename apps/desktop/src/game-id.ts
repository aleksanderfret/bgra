/** Same pattern as packages/api-contract GAME_ID_PATTERN (D12). Kept local so the
 * Electron main process stays CommonJS and does not import the ESM contract package. */
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isGameId(value: string): boolean {
  return GAME_ID_PATTERN.test(value);
}
