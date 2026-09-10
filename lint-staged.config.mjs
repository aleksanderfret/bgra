/**
 * Pre-commit formats/lints only what is about to be committed, then the
 * husky hook runs `pnpm preflight` (full lint + typecheck + tests).
 *
 * The production build stays on pre-push (`pnpm verify`).
 *
 * Python mypy runs here whenever a `.py` file is staged (cheap, whole engine).
 * Filenames are not passed to mypy — it must see the whole package. `--directory`
 * is required: lint-staged starts at the repo root, and without that mypy
 * never reads the engine `files =` list.
 */
const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');

export default {
  '*.{ts,tsx,js,cjs,mjs,mts,json,css}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '*.py': (files) => [
    `uv run --project services/rag-engine -- ruff check --fix -- ${quote(files)}`,
    `uv run --project services/rag-engine -- ruff format -- ${quote(files)}`,
    'uv run --directory services/rag-engine -- python -m mypy',
  ],
};
