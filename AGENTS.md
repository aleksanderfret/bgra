# Working in this repository

Context for coding agents. Read `docs/ARCHITECTURE.md` before changing anything in
the retrieval or streaming path — several constraints there exist to prevent the
assistant from stating rules that are not in the documents.

Project skills, Cursor rules and slash commands live in [`.cursor/`](.cursor/).
Keep them in git. Personal Cursor config stays in `~/.cursor/`.

## Stack

| Area | Choice | Note |
| --- | --- | --- |
| Frontend | Next.js 16.3, React 19, Mantine 9 | No Tailwind. Style with Mantine components and its CSS variables. |
| Types | TypeScript 7 | No programmatic compiler API until 7.1, so `typescript-eslint` cannot be used. |
| Lint | Biome 2.5 | Single config at the repo root. Do not add ESLint. |
| Tests | Vitest 4 | `globals: false`, so import `describe`/`it`/`expect` explicitly. |
| Backend | FastAPI, Python 3.14, uv | `mypy --strict` and `ruff` both gate CI. |
| Tasks | Turborepo + pnpm workspaces | Turbo 2 uses `tasks`, not `pipeline`. |

## Commands

```bash
pnpm dev        # web + engine
pnpm commit     # interactive Conventional Commit (commitizen + cz-git)
pnpm verify     # typecheck, test, build, lint — must pass before finishing work
pnpm preflight  # lint, typecheck, test — without a production build
```

Commit messages are `type(scope): subject` with a required scope from
`commitlint.config.mjs`. In a terminal, `git commit`, `git commit --amend`, rebase reword/squash,
and `pnpm commit` open the cz-git wizard. Git's editor is a no-op in this
repo. Husky `commit-msg` then runs commitlint. Do not skip hooks.

Python scripts run through `uv run`. Never emit `source .venv/bin/activate` into a
package.json script: npm runs scripts with `sh`, which has no `source`.

## Invariants

Breaking any of these produces an assistant that sounds right and is wrong.

1. **Retrieval is scoped to the active game set.** `gameId` is required on `AskRequest`.
   Optional `expansionIds` are allowed only when each id’s `baseGameId` equals that
   `gameId`. The metadata filter (`gameId` ∪ validated expansions) is applied **before**
   search, never after.
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
7. **`/api/engine/[...path]/route.ts` is the only way to the engine.** Images and audio
 included. Do not add a `rewrites()` entry to `next.config.ts` and do not let the engine
 hand the browser an absolute URL — both route around `assertMayReachEngine`, which is
 where stage 5 puts the access check. Headers are allowlisted in both directions.
8. **Both processes bind `127.0.0.1`.** `next dev`/`next start` default to `0.0.0.0`;
 the `--hostname` flags are load-bearing. Opening the LAN interface happens in the same
 change as the access check, never before it.
9. **`gameId` matches `GAME_ID_PATTERN` on both sides.** It is a retrieval filter and a
 directory name at once, so it is a slug in `contract.py` and in `types.ts`, and
 `test_contract_parity.py` fails if the two drift.
10. **No user-facing string is hardcoded.** Every word the user reads comes from
   `apps/web/src/i18n/locales/<locale>/common.json`, in both `pl` and `en`. The engine
   sends codes (`NoticeEvent.code`, `ErrorEvent.code`), never prose for the screen;
   `ErrorEvent.message` is an English technical detail for the log.
11. **The product is for board-game players, not programmers.** People who open the
   app may know nothing about AI, terminals, or software. Every player-facing flow
   must be simple, automatic, and transparent in the UI. Console, config files, and
   “run this command” are developer tools, never the way a player uses the app. See
   `.cursor/rules/player-first.mdc`.

## Conventions

- Everything written is in English: code, comments, `docs/`, and the `en` locale.
  Polish exists only as translation values in `i18n/locales/pl/`.
- Adding a key to one locale means adding it to the other. `i18n/locales.test.ts`
  fails on a key, or an interpolated value, present in one language and not the
  other; `i18n/i18next.d.ts` types every `t()` call against the English file.
- Comments follow `.cursor/skills/code-comments/SKILL.md`: only when something is
  non-intuitive, non-standard, or exceptionally complex — the way a human would.
- Every non-trivial behaviour gets a test. The pure logic — the SSE decoder and the
  answer reducer — is where correctness is cheapest to pin down.
- Model identifiers belong in `settings.py` profiles, never inline in call sites.
- Rulebooks and model weights never enter git.
