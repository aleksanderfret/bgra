> **Archive copy.** English-only historical plans used to build BGA.
> **Stage:** 0A (implemented after Stage 0, before Stage 1).
> **Origin:** Cursor plan “Security and performance hardening” (later deleted from `~/.cursor/plans/`; recovered from the session that implemented it).
> **Outcome:** implemented. Decision numbers were adjusted in `docs/ARCHITECTURE.md` (D9–D14, Z7–Z8).

---

# Stage 0A — Security and performance hardening

Three parts: fixes in existing code, decisions in the architecture, changes in
the roadmap. Guiding rule — **one doorway** between the browser and the engine,
so a later access check has exactly one place to plug in.

## Part 1 — Fixes in existing code

### 1. Bind to localhost

[apps/web/package.json](../apps/web/package.json) — `next dev --port 3000` binds
`0.0.0.0`.

```json
"dev": "next dev --hostname 127.0.0.1 --port 3000",
"start": "next start --hostname 127.0.0.1 --port 3000"
```

Opening the app on the home network becomes a conscious Stage 5 decision, not
the default.

### 2. One chokepoint for everything

Remove `rewrites()` from [apps/web/next.config.ts](../apps/web/next.config.ts).
`/api/engine/static/*` is already handled by
[route.ts](../apps/web/src/app/api/engine/%5B...path%5D/route.ts), because
`[...path]` already matches those segments.

Split cache headers — today `no-cache` is sent on everything, including 150 DPI
page renders:

- `/ask` → `no-cache, no-transform` + `x-accel-buffering: no`
- `/static/*` → `private, max-age=3600`

Add an empty seam that a later guard will fill:

```ts
// The only place the browser reaches the engine.
function assertMayReachEngine(_request: NextRequest): void {}
```

Also settle who builds the image URL: today
[test_sse.py](../services/rag-engine/tests/test_sse.py) uses `/static/assets/...`
and [answer-state.test.ts](../apps/web/src/features/rules-chat/answer-state.test.ts)
uses `/api/engine/static/...`. The engine should emit a relative path; the
frontend adds the proxy prefix.

### 3. Header allowlists in both directions

In [route.ts](../apps/web/src/app/api/engine/%5B...path%5D/route.ts) replace the
hop-by-hop list with an allowlist:

```ts
const TO_ENGINE = ['content-type', 'accept', 'accept-language'];
const FROM_ENGINE = ['content-type', 'content-length', 'etag', 'last-modified'];
```

Cookies and `authorization` stop reaching Python — after auth is added, the
engine must not receive credentials it cannot verify.

### 4. Cancellation and timeout

```ts
signal: isStreaming
  ? request.signal
  : AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
```

Timeout only for `/games` and `/health` — a long `/ask` generation is normal; a
hung health check is not.

### 5. `gameId` as a validated slug

[contract.py](../services/rag-engine/rag_engine/contract.py):

```py
GAME_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,63}$"
game_id: str = Field(pattern=GAME_ID_PATTERN)
```

On the TypeScript side, a guard `isGameId()` in
[packages/api-contract/src/types.ts](../packages/api-contract/src/types.ts), plus
a Python test that `../../etc` gets 422. The parity test compares field names,
not constraints, so the pattern needs its own test.

### 6. Stop leaking paths

[games.py](../services/rag-engine/rag_engine/routers/games.py) sends an absolute
path; `route.ts` sends `ENGINE_URL`. Both: log locally, send the client only a
`code`.

### 7. Batch tokens

[useAskStream.ts](../apps/web/src/features/rules-chat/useAskStream.ts) — the
reducer still runs on every event, but `setState` at most every ~50 ms. Terminal
events (`done`, `error`) flush immediately.

### 8. Security headers

`headers()` in [next.config.ts](../apps/web/next.config.ts): `nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
`Permissions-Policy: microphone=(self)`. CSP stays report-only for now —
Mantine injects inline styles, and `ColorSchemeScript` is an inline script, so
tightening belongs to Stage 5.

## Part 2 — Decisions in `docs/ARCHITECTURE.md`

Add to the decision log (numbers as written in this plan; later renamed in the
living architecture file):

- **One doorway.** Everything the browser takes from the engine (JSON, the
  token stream, images, audio) goes through `route.ts`. No rewrite may bypass
  it.
- **`gameId` is a validated slug**, because it is both a retrieval filter and a
  path segment.
- **We do not model identity yet, but nothing assumes it will never exist.**
  `/games` means “games visible to the asker”; `sessionId` becomes server-issued;
  every path under `storage/` is built in one helper. The choice between a
  shared library and a private one is deliberately postponed — both variants
  then cost one function.
- **Document text is data, never instructions.** Document authority is a
  ranking of rule sources, not a security boundary.

New scope decision:

- **Threat model.** Local by default, home network consciously in Stage 5,
  remote possible but unplanned. The engine never leaves `127.0.0.1`; the only
  process that may ever be exposed is Next.

Add a short annex “If we ever go remote” instead of a roadmap stage:
speech-to-text behind one interface (`mlx-whisper` is Apple Silicon — on Linux
swap the implementation, do not rewrite the stage), `storage_dir` as a volume,
logs with a request id, a concurrency limit, `/static` never without the guard.

Fix the README — questions stay local, but ingest through `yt-dlp` does leave
the machine.

## Part 3 — Changes in `docs/ROADMAP.md`

No new stage; hardening lands where the code is already being written.

- **Stage 1:** semaphore around generation and a timeout on the Ollama client.
- **Stage 2:** slug validation, `assets_path()` helper, treat a PDF as someone
  else’s file.
- **Stage 3:** chunks in the prompt wrapped in delimiters and labelled as
  source material; reranker and index loaded once at startup, not per request.
- **Stage 4:** `sessionId` issued by the server, with a TTL — not chosen by the
  client.
- **Stage 5:** replace “a simple access check” with the guard in the only
  doorway, covering `/static` too. Here and only here Next may bind beyond
  loopback.
- **Stage 6:** in the evaluation set, a separate group with a poisoned chunk
  (“ignore the previous instructions”) next to the refusal group.
- **Stage 7:** if Markdown rendering arrives, no `dangerouslySetInnerHTML`
  without sanitising — today React already escapes for us.

## Verification

`pnpm verify` after each part. New tests: reject a `gameId` that looks like a
path, no filesystem path in error bodies, an image that used to go through a
rewrite now hits the guard.
