/**
 * Pre-commit only looks at what is about to be committed.
 *
 * TypeScript typecheck, tests, and the production build stay on pre-push
 * (`pnpm verify`): they need the whole graph.
 * Python mypy is cheap and is the check that kept failing only on push, so it
 * runs here whenever a `.py` file is staged. Filenames are not passed to mypy
 * — it must see the whole engine, not just the touched files. `--directory`
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
