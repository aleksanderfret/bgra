> **Archive copy.** English-only historical plan used to build BGA.
> **Stage:** 3F.
> **Origin:** Cursor plan for Stage 3F (honest status when search never started).
> **Outcome:** implemented.

---

# Stage 3F — Search never started (honest status)

**Goal:** When `/health` is reachable, loading has finished, and the search stack never
came up, the player sees a dedicated banner (not offline, not endless preparing), Ask
stays off, PDF import stays off, and **Try again** re-runs retrieval load in-app.

**Architecture:** Derive UI phase `search_unavailable` from existing health flags
(`retrieval_loading`, `reranker`). `POST /retrieval/reload` re-schedules
`schedule_retrieval_load` with single-flight and a generation counter so a cancelled
warm-up cannot clear loading for a newer attempt. Banner owns the retry POST;
`useEngineReadiness` stays phase-only.

## Locked choices

- Recovery: in-app Try again + close/reopen in body copy.
- PDF import blocked unless phase is `ready` (game list still loads).
- Canonical ready signal: `components.reranker === true` (fail closed).
- Shared contract type `RetrievalReloadResponse { started: boolean }`.
- Alert: yellow `role="alert"` for `search_unavailable`; blue preparing; orange offline.

## What shipped

- `phaseFromPoll` matrix in `apps/web/src/features/engine-readiness/`.
- `EngineReadinessBanner` Try again → `POST /api/engine/retrieval/reload`.
- Generation-safe `_warm_retrieval` / `schedule_retrieval_load` in `main.py`.
- Ask already required `ready`; PDF import now does too.
- i18n `engineReadiness.searchUnavailable.*` in `en`/`pl`.

## Out of scope (then)

- Stage 3C index catch-up, 3B first-run gate, load timeout during `starting`,
  readiness React context.
