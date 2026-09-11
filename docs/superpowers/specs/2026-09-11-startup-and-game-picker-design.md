# Design: Faster startup and scalable game picker

Date: 2026-09-11  
Status: approved for planning

## Goal

Open the app faster and keep a large game library usable. Do not block the
whole UI on “every game in the library is caught up.” Let players pick a game
with search + recent history, even when the collection has thousands of titles.

Direction **B**: ship the faster startup and picker now; keep a **roadmap
note** that a later change may use one search store per game if a single shared
store ever slows cold start at extreme library sizes. Do **not** build per-game
stores in this work.

## Context (today)

Startup warms the answer path in the background: the passage-ranking helper,
Ollama answer/embed weights, and a walk that checks whether **every** game’s
on-disk passages match the shared search store. Ask stays gated until that
bundle finishes. Game pickers load the full `GET /games` payload into a plain
Mantine `Select`.

The long wait players already feel is dominated by the ranking helper and
Ollama, not by game count. A 2000-game library mainly adds cost to the “check
every game” walk and makes the Select unusable — not “search all games on every
question” (Ask already filters by the active game before search).

## Part 1 — Startup

### Startup screen (blocking)

Show ordered, player-facing stages on the existing startup / preparing surface.
Engine emits stage **codes**; copy lives only in `en` / `pl` catalogues.

| Order | Intent (implementation) | Player-facing copy (PL locked) | EN (draft) |
| --- | --- | --- | --- |
| 1 | Process / engine coming up | Uruchamiam asystenta… | Starting the assistant… |
| 2 | Answer-model / Ollama ready path | Uczę asystenta odpowiadać na pytania… | Teaching the assistant to answer questions… |
| 3 | Passage-ranking helper ready | Uczę się szybciej znajdować reguły w instrukcji… | Learning to find rules in the rulebook faster… |

No words like “model”, “reranker”, “Ollama”, or “index” in UI copy.

When stages 1–3 are done enough for the shell, **enter the normal app view**.
Do **not** keep the player on the startup screen for the full-library catch-up.

### After landing (non-blocking)

While the full-library catch-up still runs in the background:

- Fixed bar at the **bottom center** of the page: small loader + status text.
- Locked sense (PL): *Sprawdzam, czy wszystkie Twoje gry są gotowe do pytań.
  Jeśli zapytasz wcześniej, odpowiedź może chwilę poczekać.*
- EN draft: *Checking that all your games are ready for questions. If you ask
  before this finishes, the answer may take a little longer.*

Ask and Learn stay **allowed**. If the player asks (or starts Learn) while
catch-up or answer weights are still loading, show an in-flow wait with honest
status — the wait moves to the action, not an endless startup gate.

Prefer accelerating catch-up for the **selected** game when the player asks
early (implementation detail for the plan), so one question does not wait on
1999 unrelated titles.

When catch-up finishes, hide the bottom bar.

### Roadmap footnote (not this delivery)

If a single shared search store plus full-library catch-up still hurts at
extreme collection sizes after measurement, consider one store per game loaded
on selection. That would replace the “all your games” bottom bar with a
per-game preparing state. Out of scope for this design’s implementation.

## Part 2 — Game picker

Replace plain `Select` lists (Questions, Learn, and any other game chooser that
shares the same pattern) with one shared control.

### Data

- Load a **slim** catalogue into memory once per screen/session refresh:
  at least `gameId` + `title` (and enough to know base vs expansion if the UI
  still needs that split). Prefer a lean API shape if the full `GameSummary`
  list is too heavy; full document lists are not required to open the picker.
- Refresh the in-memory list when the library changes (e.g. after PDF import),
  not on every keystroke.
- Filtering while typing runs **in the renderer** against that list — no disk
  and no search-store round trip per character.

### Interaction

- Autocomplete / combobox with type-to-filter.
- Empty query:
  1. Section **Recently used** — max **10** games (persisted locally, e.g.
     `localStorage`, keyed for the product; exact key in the plan).
  2. Section **All** — remaining games, **A→Z**, excluding titles already in
     Recently used so there are no duplicates.
- Non-empty query: show search hits (section **Results** or equivalent). Do
  not mix a stale “Recently used” block in a confusing way while filtering.
- Open list must be able to show **more than** the 10 recent rows (All /
  Results below).
- Scroll the options list with **virtualization** via Mantine `Combobox` +
  `useVirtualizedCombobox` and **`@tanstack/react-virtual`** (not
  `react-virtuoso`).

### Accessibility

- Visible, translated **group headings**: Recently used, All (and Results when
  searching).
- Expose groups so assistive tech can announce section boundaries (Combobox
  group labelling / `role="group"` — exact wiring in the plan; must be
  keyboard- and screen-reader-friendly, WCAG-oriented).

### Sorting and matching

- Sort with `Intl.Collator` using the **active UI locale** (`pl` / `en`), so
  letters such as ą, ó, ü, ñ, č sort correctly — not ASCII-only order.
- Search matching must be case-insensitive and locale-aware for diacritics
  (same collator / normalized compare strategy — detail in the plan).

### Copy

All new strings in `apps/web/src/i18n/locales/en/common.json` and
`…/pl/common.json` in the same change. No hardcoded UI text.

## Out of scope

- Per-game search stores (roadmap only).
- Server-side game search API (local in-memory filter first).
- Changing Ask retrieval semantics (`gameId` filter before search stays).
- Stage 5 voice completion / Stage 6 evaluation harness.
- Auto-commit of this work.

## Success

- Startup screen finishes after assistant readiness stages 1–3; player reaches
  the normal view without waiting on full-library catch-up.
- Bottom bar explains catch-up and early-ask cost; disappears when done.
- Early Ask / Learn shows an in-app wait instead of a dead startup screen.
- Game picker: recent ≤10, All A–Z with headers, fast typeahead, virtualized
  scroll, locale-aware sort.
- `pnpm verify` passes when implemented.

## Follow-up

After approval of this file, write an implementation plan under
`docs/superpowers/plans/` and add a short ROADMAP note for the optional
per-game store fallback.
