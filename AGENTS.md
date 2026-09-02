# Working in this repository

Context for coding agents. Read `docs/ARCHITECTURE.md` before changing anything in
the retrieval or streaming path — several constraints there exist to prevent the
assistant from stating rules that are not in the documents.

## Stack

| Area | Choice | Note |
| --- | --- | --- |
| Frontend | Next.js 16.3, React 19, Mantine 9 | No Tailwind. Style with Mantine components and its CSS variables. |
| Types | TypeScript 7 | No programmatic compiler API until 7.1, so `typescript-eslint` cannot be used. |
| Lint | Biome 2.5 | Single config at the repo root. Do not add ESLint. |
| Tests | Vitest 4 | `globals: false`, so import `describe`/`it`/`expect` explicitly. |
| Backend | FastAPI, Python 3.13, uv | `mypy --strict` and `ruff` both gate CI. |
| Tasks | Turborepo + pnpm workspaces | Turbo 2 uses `tasks`, not `pipeline`. |

## Commands

```bash
pnpm dev        # web + engine
pnpm verify     # typecheck, test, build, lint — must pass before finishing work
```

Python scripts run through `uv run`. Never emit `source .venv/bin/activate` into a
package.json script: npm runs scripts with `sh`, which has no `source`.

## Invariants

Breaking any of these produces an assistant that sounds right and is wrong.

1. **Retrieval is always scoped to one game.** `gameId` is required on `AskRequest`
   and the metadata filter is applied before search, never after.
2. **The model never names a file path.** Images are attached by the backend in the
   `sources` frame; the model may only reference an id. The frontend displays a
   figure only if that id is present in the sources it received.
3. **`sources` is sent before the first token.** The frontend must not have to guess
   which evidence an answer was based on.
4. **`insufficient_evidence` is a valid answer.** Do not add fallbacks that produce
   an answer when retrieval found nothing relevant.
5. **Document authority order is fixed:** `video_transcript < player_aid < rulebook
   < faq < errata`. Transcripts supply teaching style, never rules.
6. **The contract has two sides.** Changing `packages/api-contract/src/types.ts`
   requires the matching change in `services/rag-engine/rag_engine/contract.py`;
   `tests/test_contract_parity.py` enforces it.

## Conventions

- Code and comments in English; user-facing strings and `docs/` in Polish.
- Comment only what the code cannot show: a constraint, a non-obvious reason. Not
  what the next line does.
- Every non-trivial behaviour gets a test. The pure logic — the SSE decoder and the
  answer reducer — is where correctness is cheapest to pin down.
- Model identifiers belong in `settings.py` profiles, never inline in call sites.
- Rulebooks and model weights never enter git.
