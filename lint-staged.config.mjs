/**
 * Pre-commit only looks at what is about to be committed.
 *
 * Typecheck and tests stay on pre-push (`pnpm verify`): both need the whole
 * graph, so running them here would pay the full cost on every commit.
 */
export default {
  '*.{ts,tsx,js,cjs,mjs,mts,json,css}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '*.py': [
    'uv run --project services/rag-engine -- ruff check --fix',
    'uv run --project services/rag-engine -- ruff format',
  ],
};
