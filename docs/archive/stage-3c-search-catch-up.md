> **Archive copy.** English-only historical plan used to build BGA.
> **Stage:** 3C.
> **Origin:** Cursor plan for Stage 3C (search catch-up for an existing library),
> tightened after critical review.
> **Outcome:** implemented — boot catch-up already existed; honesty gaps and
> `ensure_search_index` hardening closed.

---

# Stage 3C — Search catch-up for an existing library

**Goal:** A game already on the list with pages on disk is never told “import a PDF
again.” Catch-up rebuilds search automatically on start; when vectors are still
missing after that, the player gets an honest in-app recovery — not a fake empty
library.

**Architecture:** Keep the existing boot path (`_warm_retrieval` →
`ensure_search_index` under `retrieval_loading`). Ask path is read-only: if the
index has zero rows for the active game set, `active_set_has_chunks` decides
between `engine_not_indexed` (nothing on disk) and `search_catch_up_needed`
(rules present, search not ready — close and reopen). Catch-up migrates Stage 2
layouts before skipping, uses on-disk counts, and isolates per-document
`IndexingError`.

## Locked choices

- New notice: `search_catch_up_needed` (not a reuse of `retrieval_not_ready`).
- Recovery copy: close and reopen only — no Ask-screen retry button this stage.
- Ask path never calls `migrate_legacy_flat_pages` (read-only).
- No new `/health` field or readiness phase.
- Incomplete (non-zero but short) indexes are out of scope for the Ask stop;
  only `count_for_games == 0` branches.

## What shipped

- Boot catch-up while `retrieval_loading` (`main.py` → `ensure_search_index`).
- Stage 2 flat-page + `doc_key` upgrade during catch-up.
- Ask honesty: `active_set_has_chunks` + `search_catch_up_needed` / `engine_not_indexed`.
- i18n `notice.search_catch_up_needed` in `en`/`pl`; listed in `NOTICE_CODES`.
- Hardened `ensure_search_index`: migrate-before-skip, on-disk counts, per-doc
  `IndexingError` isolation (module-level `maybe_index_document` kept for tests).
- Manual `POST /ingest/reindex` (Rulebooks) unchanged.

## Out of scope (then)

- Ask-screen Try again / new health component for catch-up failure.
- Stage 3A / 3B / 3D.
- Orphan asset folders with no `games.json` entry.
