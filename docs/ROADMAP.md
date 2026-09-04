# Execution plan

The stages are ordered so that **each one ends with something runnable**, rather than
another layer with no visible effect. The acceptance criteria are written as checkable
facts — they can be handed to an agent as a definition of done.

A rule that applies to every stage: `pnpm verify` must pass before a stage is closed.

Implementation plans used to build each stage (English, numbered in the order they
were done) live in [`docs/archive/`](archive/README.md).

---

## Stage 0 — Repository and harness ✅ **complete**

The monorepo, the interface, the streaming flow and the API contract.

Plans: `docs/archive/stage-0-architecture-and-plan-audit.md` (original plan and
decisions) and `docs/archive/stage-0-execution-roadmap.md` (stage list).

- pnpm workspaces + Turborepo, one `pnpm dev` command runs both processes
- Next.js 16.3 · React 19 · Mantine 9 · TypeScript 7 · Vitest 4 · Biome 2.5
- FastAPI · Python 3.14 · uv, with `mypy --strict` and `ruff`
- A shared contract with a reference SSE decoder and a parity test
- Interface in Polish and English (i18next), no user-facing string hardcoded
- Tests including the guarantee that invented image references are rejected

---

## Stage 0A — Security and performance hardening ✅ **complete**

**Goal:** the browser can only reach the engine through one doorway, both
processes listen on this computer only, and cheap mistakes (a bad game id, a
leaked disk path, a hung health check) are caught before they get expensive.

Done after the harness, before local models. Plan: `docs/archive/stage-0a-security-and-performance-hardening.md`.

- Both processes bind to `127.0.0.1` (D9)
- One un-bypassable route to the engine (`/api/engine/*`) with allowlisted
  headers and an `assertMayReachEngine` seam (D10); no `rewrites()` around it
- Upstream cancellation on disconnect (D11); a 10 s deadline on `/games` and
  `/health` only — not on `/ask`
- `gameId` as a slug on both sides of the contract (D12)
- Error bodies send a `code`, never a filesystem path or the engine URL
- Batched token painting (Z7)
- Baseline security headers (`nosniff`, `Referrer-Policy`, frame deny,
  microphone permission policy); CSP stays report-only until Stage 5

**Acceptance:** the UI is unreachable from another device on the same Wi-Fi;
page images go through `/api/engine/static`, not a rewrite; a `gameId` like
`../x` is rejected; `pnpm verify` passes.

---

## Stage 0B — Electron desktop shell ✅ **complete**

**Goal:** one Dock icon starts the same web app and engine, without a terminal.

Done after 0A, before local models. Plan: `docs/archive/stage-0b-electron-desktop-shell.md`.

- `apps/desktop`: main process resolves `uv` and Ollama without relying on
  `PATH` (a Dock launch has no shell profile)
- Next and the engine are child processes on free ports; a second click raises
  the existing window instead of starting a second engine
- Storage is `BGA_STORAGE_DIR` under user data, so an update cannot wipe the
  library
- First-run screen is a Next route (`/[locale]/setup`), not a native window —
  copy stays in `en`/`pl` catalogues
- `minimal-16gb` profile; hardware check maps this computer to a profile
- Packaging is a separate `package` script, outside `pnpm verify`
- Microphone permission hook and `Info.plist` usage string, ready for Stage 5
- Speech extras: `mlx-whisper` on Mac, `faster-whisper` elsewhere (the
  recogniser itself waits for Stage 5)

**Acceptance:** opening the app from Finder (not a terminal) shows the UI;
closing the window leaves no orphaned Python process; `pnpm verify` does not
build a `.dmg`.

---

## Stage 0C — Desktop release pipeline ✅ **complete**

**Goal:** a version tag produces a macOS installer and a GitHub Release, without
shipping rulebooks, models, or secrets.

Done after 0B, before local models. Plan: `docs/archive/stage-0c-desktop-release-pipeline.md`.

- `pnpm release:prepare` bumps every package version and writes `CHANGELOG.md`
  (no auto-tag)
- `pnpm release:package` builds the web app, checks the standalone layout, then
  packs an unsigned arm64 `.dmg` / `.zip`
- GitHub Action on `v*` tags: version must match `package.json`; only the newest
  release keeps installer files
- Engine files in the package are an allowlist (runtime only)

**Acceptance:** a local package contains `repo/apps/web/server.js` and does not
contain `storage/`, `.venv`, tests, PDFs, `.env`, or `models`; pushing a matching
tag creates a Release with notes from the changelog.

---

## Stage 1 — Running the models locally ✅ **complete**

**Goal:** the engine actually talks to a model; `/health` tells the truth.

Plan: `docs/archive/stage-1-local-models.md`.

- `scripts/pull-models.sh` downloads the models of the active profile and **stops with a
  readable error** when a tag does not exist in the Ollama registry (model labels change
  between releases — this is a one-off verification)
- An Ollama client in `rag_engine/engines/llm.py`, with token streaming
- `/health` checks for the **specific** models of the profile, not just whether Ollama
  responds
- The `/ask` endpoint streams a real model's answer, still without retrieval
- A semaphore around generation: one machine, one GPU, so a second question waits instead
  of thrashing. The proxy already cancels upstream on disconnect (D11) — the engine has
  to release the slot when that happens, or the queue fills with abandoned answers.
- A timeout on the Ollama client itself. The 10 s deadline in the proxy deliberately does
  not cover `/ask`, so a model that stops producing tokens hangs until something else
  notices.

**Acceptance:** `curl` against `/ask` returns a model-generated answer, token by token;
`/health` reports `degraded` naming the missing model when one is absent; two questions
at once are answered one after the other, and killing the first frees the slot at once.

---

## Stage 2 — Document ingestion ✅ **complete**

**Goal:** a PDF and a video become ordered, addressable material ready for Stage 3
search. Chunks are stored as **JSONL** (`ChunkRecord` without `vector`); LanceDB /
embeddings arrive in Stage 3.

Plan: `docs/archive/stage-2-document-ingestion.md`.

- `uv sync --extra ingest`
- PDF → Markdown via `pymupdf4llm`, **preserving page numbers** (without them there are
  no citations)
- Render each page to a 150 DPI PNG in `storage/assets/<gameId>/pNN.png`
- Split on Markdown headings; a chunk never crosses a section boundary
- Persist chunks as JSONL under `storage/assets/<gameId>/documents/…` (no vector field yet)
- YouTube subtitles: `youtube-transcript-api` (instance API, `.fetch()`), falling back to
  `yt-dlp` + Whisper when the author disabled subtitles **and** the `speech` extra is
  installed
- A game registry in `storage/games.json` matching `GameSummary`
- CLI: `uv run python -m rag_engine.ingest add --game azul --kind rulebook file.pdf`
- `--game` is rejected unless it matches `GAME_ID_PATTERN` (D12) — the value becomes a
  directory name, so a bad one is caught at ingestion rather than at request time
- Every path under `storage/` comes from one helper (`assets_path()` and friends), never
  from string concatenation at the call site. That is what makes scoping a library to an
  owner one change later instead of a search (D13).
- `imageUrl` is minted as `/static/assets/<gameId>/pNN.png` — relative to the engine root,
  never absolute. The frontend adds the proxy prefix, so Python stays ignorant of how Next
  routes; an absolute URL is dropped by the reducer instead of rendered (D10).
- A PDF and a transcript are **someone else's file**: parse defensively, cap page counts
  and extracted sizes, and never let a filename from the document reach the filesystem
- **Community FAQ fetch (option A):** during ingestion, when the user adds a game, the
  app offers to download the official FAQ and popular rules-clarification threads from
  BoardGameGeek for that game. Downloaded material is saved locally as documents with
  `documentKind: "faq"` and indexed alongside the rulebook. This happens **only during
  ingestion** (when the user already has internet), never during gameplay. Only the game
  title is sent in the request — no personal data leaves the machine.

**Acceptance:** CI uses a generated fixture PDF (no publisher rulebooks in git). After
ingesting one or two of **your own** PDFs locally (Z5: one simple game, one complex —
titles are not hardcoded in the repo) `/games` returns them with a non-zero
`chunkCount`, `storage/assets/<gameId>/` contains the rendered pages, and ingesting
under a `--game` like `../x` fails before anything is written. Answers still come from
general model knowledge until Stage 3.

---

## Stage 2A — Library: documents and expansions ✅ **complete**

**Goal:** several PDFs under one game (solo, almanac, late supplements) and expansions as
**separate** library entries linked to a base game, without a complicated Ask UI.

Plan: `docs/archive/stage-2a-multi-doc-expansions.md`. Originally labelled 2B; nothing was
built between Stage 2 and this work, so it is 2A.

- Expansions are their own `gameId` with `baseGameId` pointing at the base (published
  later, imported later).
- Extra booklets for the same product are **documents** under one `gameId` (`docKey` +
  human title + `manifest.json`), not new games.
- Page images live **per document** (`documents/<kind>/<docKey>/pNN.png`), never in a
  flat game folder — otherwise a second PDF overwrites the first.
- Chunk ids include `docKey`: `{gameId}:{kind}:{docKey}:pNN:cNN`.
- `GameSummary` lists `documents[]` and optional `baseGameId`; `AskRequest` adds
  `expansionIds` (server accepts an id only if that game’s `baseGameId` equals `gameId`).
- Retrieval (Stage 3) scopes to the **active game set** (`gameId` ∪ validated
  `expansionIds`) **before** search — rewrite of the old “exactly one game id” wording.
- Same `documentKind` conflict: prefer newer `indexedAt`; sources show `documentTitle`.
- Rulebooks UI: one form, two modes (“New game” / “Add PDF to existing”), clear copy so a
  supplement is not created as a new game; expansion link only on “New game”. Related
  controls wrapped in real HTML `<fieldset>` + `<legend>`.
- Ask UI: base-game select + expansion checkboxes (default off); no per-booklet picker.
- Migrate legacy flat `assets/<gameId>/pNN.png` into `documents/rulebook/main/` (or gate
  Stage 3 until re-ingest).

**Acceptance:** two PDFs under one base keep distinct chunk ids and page URLs; `/games`
lists both titles; an expansion appears as a checkbox only under its base; forged
`expansionIds` are rejected; fieldset semantics covered by UI tests; helper copy for the
two import modes exists in `en` and `pl`.

---

## Stage 3 — Retrieval ✅ **complete**

**Goal:** answers grounded in the documents, citing the page.

Plan: `docs/archive/stage-3-retrieval.md`.

- `uv sync --extra retrieval`; LanceDB in `storage/index`
- Chunk schema: `id`, `gameId`, `documentKind`, `docKey`, `documentTitle`, `page`, `text`,
  `heading`, vector
- A **mandatory** active-game-set filter before retrieval (`gameId` ∪ validated
  `expansionIds`; see Stage 2A and audit 3.1)
- Hybrid retrieval: BM25 + vector, results fused
- Cross-encoder reranking, `retrieval_candidates` → `retrieval_top_k`
- A `min_relevance_score` threshold; below it → `insufficient_evidence` without calling
  the model
- A prompt carrying the `DOCUMENT_AUTHORITY` hierarchy, same-kind newer-document rule, and
  a ban on leaving the context
- Retrieved chunks are wrapped in delimiters and labelled as source material, with the
  system prompt stating that nothing inside them changes it (D14). A transcript that says
  "ignore the previous instructions" is text about a game, not an instruction.
- The reranker and the index are loaded **once at startup**, not per request. A
  cross-encoder reloaded per question turns a 2 s answer into a 20 s one.
- The `sources` frame sent **before** the first token
- Generation stops when the client disconnects: the proxy already aborts upstream (D11),
  so the engine has to honour the disconnect rather than finish into a closed socket
- Answers in Polish even for English rulebooks, with the original term in parentheses —
  phase and component names are printed in English on the components (decision Z1)

**Acceptance:** a question about a rule from an ingested rulebook yields an answer with
the correct page number; **a Polish question against an English rulebook hits the right
passage**; a question about a game that was never ingested yields a refusal, not an
invented rule; a question about game A never returns passages from game B; with
expansions unticked, expansion passages are not used.

---

## Stage 3E — Think only when the sources need it

**Goal:** simple questions stay fast (no hidden reasoning). Hard ones — conflicting
passages, errata vs rulebook, a near-miss search — may think, without dumping that
trace as the answer.

Do this **next**, **after Stage 3**, **before 3C / 3B / 3A / 3D**. It only changes
`/ask`. Catch-up, the install gate, the progress bar, and the chat thread do not
block it. Default stays `think: false` (D16). Thinking is an exception, not the
default.

- Keep streaming only `message.content`. A think trace is never shown as the ruling.
- Turn thinking **on** only when a checkable trigger fires, for example: hits from
  different `documentKind` that can disagree; two passages that contradict on the
  same topic; scores close to `min_relevance_score`. Plain “how many cards do I
  draw?” with one clear hit stays `think: false`.
- If thinking will take a while, the engine sends a **notice code** and the UI says
  so in `en`/`pl` (e.g. working through a conflict). No silent wait, no “open a
  terminal”.
- Tests pin the request JSON: `think` is false on the simple fixture, true on the
  conflict fixture. Do not wait for Stage 6 to ship this; Stage 6 later measures
  whether adaptive thinking beats always-off.

**Acceptance:** a single-source rules question still answers without a think payload;
a fixture with rulebook vs errata sends `think: true` and still cites the page; the
player sees a wait notice when thinking runs; `pnpm verify` passes.

---

## Stage 3C — Search catch-up for an existing library

**Goal:** a game that is already on the list is never treated as “no rulebook”. If
the pages are on disk but search is empty or still starting, the player sees a wait
state — not an error that tells them to import the PDF again.

Do this **after Stage 3**. In `pnpm dev` it can ship **before 3B** (Ollama and models
are already there). On a packaged install it must run **after 3B**, because catch-up
needs the embedding model. Stage 3A (new-import percent bar) does not replace this:
3A is the next PDF; 3C is yesterday’s library.

- On engine start, if `games.json` lists documents with chunks on disk but the search
  index has no rows for that game, **rebuild the index automatically** (same work as
  `python -m rag_engine.ingest index`). No terminal step for the player.
- While that rebuild (or the reranker load) is running, the UI keeps the existing
  preparing status. Ask stays disabled or returns a wait notice, not `engine_not_indexed`.
- `engine_not_indexed` only when there is **no** material on disk for the active game
  set. Chunks present + empty index is catch-up, not “import a PDF”.
- Catch-up also upgrades Stage 2 files (missing `doc_key`, page pictures in the flat
  game folder) so an old import becomes searchable without dropping the PDF again.
- Failure to embed (Ollama down) is an in-app recovery (“start the assistant again”),
  never a command to paste.

**Acceptance:** a library like World Order — on the list, chunks on disk, empty index —
becomes searchable after one normal app start, without importing the PDF again; Ask
does not show “load a rulebook PDF” for that game; a game with nothing on disk still
refuses honestly; `pnpm verify` passes.

---

## Stage 3B — First-run install gate

**Goal:** a packaged Mac or Windows build cannot be used until the machine has Ollama
and the models for the recommended profile. The user sees **why**, clicks once, and
either finishes or quits — there is no “skip” into an empty assistant.

Do this **after Stage 3**, **before 3A**. Retrieval is what those downloads are *for*;
until then a first-run wall would install gigabytes so the model can still guess.
Stage 3C (catch-up for an existing library) can land in `pnpm dev` before this gate;
on a packaged install catch-up waits until this gate has models. Ingest progress (3A)
can wait: a person who opens the `.dmg` must be able to get a working arbiter before
we polish the PDF bar. Same screen on both platforms (the setup route already exists);
do not split this into an NSIS page vs a Finder `.dmg` note.

- On every desktop launch, if the gate is not passed, show **only** this view. The
  rest of the app is unreachable. Closing the window is the only way out.
- The copy lists what this computer needs, from the **already-chosen profile** (RAM,
  disk, Ollama, chat + embedding models). No generic scare list — the same snapshot
  the setup screen already computes.
- One primary action: install / download. The app fetches the **official** Ollama
  installer (not bundled inside `BGA.app`, so it is not part of our signature) and
  then pulls the profile models. The OS may still show its own confirmation for
  Ollama (Gatekeeper / UAC); that is expected and must be explained up front.
- Until Ollama is installed **and** running **and** the profile models are present,
  Continue stays disabled. The next launch shows the same view until the gate
  passes; passing it is a stored flag plus a live check (deleting Ollama must bring
  the wall back).
- `pnpm dev` in the browser stays ungated (no Electron bridge). This stage is the
  packaged / desktop-shell path.

**Acceptance:** a fresh desktop install with no Ollama cannot open Ask or Rulebooks;
after the user confirms the OS prompt and the downloads finish, the next screen is
the assistant; quitting mid-download and reopening resumes the same wall, not a
half-ready UI; Mac and Windows present the same steps.

---

## Stage 3A — Ingest progress

**Goal:** wherever a rulebook PDF is added (setup drop zone, desktop shell, or CLI), the
user sees a **smooth percent** and a **stage label**, not four equal jumps of 25%.

Plan: `docs/archive/stage-3a-ingest-progress.md`.

Do this **after Stage 3, 3C and 3B**. The last honest slice of the bar is writing search vectors
(`indexing`). Before Stage 3 that work does not exist; faking “the chat model is learning
the rules” would freeze the bar with nothing real happening. 3C covers games already in
the library; 3A is only the import happening now. 3B comes first on a packaged install so
the models the bar is indexing for are actually present.

- Stages are **codes** (UI copy in `en`/`pl`): `sending`, `saving`, `reading`, `drawing`,
  `filing`, `community` (only if the BoardGameGeek checkbox is on), `indexing`
- Measure what actually moves: upload **bytes** (`sending`), disk **bytes** (`saving`),
  **page i of n** (`reading` and `drawing`), library ticks (`filing`), then per-chunk or
  per-batch index writes (`indexing`). Blend so the bar never goes backwards
- `POST /ingest/pdf` streams progress the same way `/ask` streams an answer (progress
  frames, then done or error). Upload percent is measured in the browser; the engine
  cannot report it until the file has arrived
- `indexing` is search vectors, not training the chat model
- CLI prints the same percent and stage (English log lines, not the UI catalogues)

**Acceptance:** a multi-page PDF makes the bar tick often (at least once per page while
reading and drawing); the label under the bar matches the current code; a second import
while one is running is still rejected; cancelling the upload stops the work. After
Stage 3, `indexing` is visible and the bar reaches 100% only when the game is searchable.

---

## Stage 3D — Conversation thread

**Goal:** the rules assistant is a **chat you can scroll**, not a form that forgets the
last answer. At the table you need to look back: someone did not hear, the room is too
loud to play sound, or the same ruling comes up two turns later. Voice (Stage 5) reads
these same messages aloud — it never replaces the written thread.

Do this **after Stage 3** (answers must be grounded first) and **before Stage 4 and 5**.
Teaching is a conversation; speech is the same conversation spoken. Today the Ask screen
replaces the previous answer on every submit.

- A new question **appends** a player / assistant pair. The earlier turns stay on
  screen and can be scrolled.
- Each **game** has its own thread, stored on this computer with that game. Choosing
  the game again loads that thread. Switching games switches threads — Azul never
  shows Wingspan's answers.
- Written text is always on screen, including when the answer is also spoken. Sound
  off, or no headphones, still leaves a complete answer to read.
- History is the **player's notes**, not a rules document. Do **not** ingest past
  answers as `documentKind: "faq"`. Official FAQ outranks the rulebook; a wrong chat
  answer must not become the law the next time retrieval runs.
- Optional later, still in this stage if cheap: if a new question is very similar to
  an earlier turn, the UI can point at that turn ("you asked something like this").
  A fresh answer still comes from the rulebook unless the player only wanted to
  re-read what was already said.

**Acceptance:** a second question leaves the first visible; quitting and reopening the
same game shows the thread; another game's thread is not mixed in; with sound off the
full answer is still readable; past chat is not in the search index as FAQ;
`pnpm verify` passes.

---

## Stage 4 — Teaching mode

**Goal:** the assistant teaches rather than merely answering. The lesson uses the
**same visible thread** as Stage 3D — modules appear as turns you can scroll back to,
not a panel that wipes the last one.

- Separate prompts for `teach` and `arbitrate`
- Teaching style drawn from tutorial transcripts, supplied as an example in the system
  prompt, **marked as not being a source of rules**
- Session state keyed by `sessionId`, **issued by the server and given a TTL** (D13). A
  client-chosen identifier would be someone else's lesson for the price of a guess — the
  cost of getting this right is nil today and considerable once anyone else can connect.
  That id tracks *where the lesson is*, not the written history (the thread is per game
  and durable; this id is short-lived).
- Lesson structure: goal → theme → mechanics → turn → sample move, with a comprehension
  check after each module

**Acceptance:** a "teach me this game" conversation walks through the modules without
dumping everything at once, earlier modules stay visible in the thread, and switching
to `arbitrate` mid-session produces a short answer with a citation.

---

## Stage 5 — Voice

**Goal:** a conversation without a keyboard. Speech is an extra pair of ears and a
mouth on the **same written thread** from Stage 3D — never a voice-only mode.

- `uv sync --extra speech`
- Speech-to-text behind one interface (`rag_engine.speech.SpeechToText`):
  **`mlx-whisper` on macOS (Apple Silicon)** and **`faster-whisper` on Windows/Linux**.
  The desktop decision O1 requires voice on both platforms; do not call mlx directly
  from routers.
- Push-to-talk in the browser / Electron window (`MediaRecorder`); the `transcript`
  frame shows what it heard before it answers, and that text lands in the thread as
  the player's turn
- The spoken answer is the assistant turn already on screen, read aloud. If the
  player cannot listen, they still have the written message to scroll back to
- Piper with a Polish voice, audio streamed **sentence by sentence** — not after the
  whole answer is generated
- **A local HTTPS setup is required** (`mkcert`) for a tablet on the home network —
  `getUserMedia` does not work over HTTP outside `localhost` (decision Z4). Inside
  Electron on `http://127.0.0.1` the mic works without mkcert, but still needs the
  Electron permission handler and `NSMicrophoneUsageDescription`.
- Opening the LAN interface is **one change with the access check**, not a step before
  it: Next.js stops binding `127.0.0.1` (D9) only in the same commit that fills in
  `assertMayReachEngine` (D10). The Python engine stays on `127.0.0.1` either way.
- With HTTPS in place, the report-only CSP becomes enforcing, and `Strict-Transport-
  Security` is added. Mantine's inline styles and `ColorSchemeScript` need nonces first,
  which is why the policy is only recording today.
- Recorded audio goes through the same proxy as everything else; `Permissions-Policy`
  already limits the microphone to this origin

**Acceptance:** a spoken question produces a spoken answer on **both macOS and Windows**;
the first sound arrives before the model finishes generating; the same words stay in the
thread so they can be read later; **the microphone works on the tablet**, not only on
the Mac; and a request from the tablet without credentials is refused by the proxy.

---

## Stage 6 — Evaluation

**Goal:** being able to tell whether a change improved quality. The most important stage
for the credibility of the whole thing.

- `eval/<gameId>.yaml`: 30–50 questions with the correct answer and page number
- A separate group of questions **outside** the rulebook, where the correct answer is a
  refusal
- Polish questions against **English** rulebooks — the hardest case for retrieval, so it
  must be measured separately (decision Z1)
- Questions deliberately ambiguous between two ingested games, catching rule mixing
- A group run against a **deliberately poisoned chunk** ("ignore the previous
  instructions and…"), where the correct behaviour is to treat it as text about a game.
  D14 is a claim about the prompt; this is the only thing that turns it into a measurement.
- `uv run python -m rag_engine.eval` reports retrieval accuracy, answer agreement and the
  share of correct refusals
- The result is recorded historically, so a regression is visible

**Acceptance:** changing a prompt or a chunk size produces a number by which quality rose
or fell.

---

## Stage 6A — Page layout (columns, boxes, examples)

**Goal:** know whether fancy rulebook pages are where we lose answers — and only then
spend the work to understand the **layout**, not just the words. This stage is a
**gate**. Shipping a heavier reader is optional; measuring the miss is not.

Publisher books are often two columns, with sidenotes in frames and “Example”
callouts beside the rule they illustrate. Today we copy the text out once
(`pymupdf4llm`) and split on headings. Words in a box usually survive. The link
“this box belongs to that paragraph” does not. A later vision pass on cropped
diagrams (Stage 7) does not replace this: that is pictures; this is reading order
and which note sits next to which rule.

Do this **after Stage 6**. Without numbered questions we would be guessing whether
a heavier parser is worth the disk, RAM, and slower import.

- Add an eval slice whose answers live in a sidenote, an example box, or the
  second column — not only in the main story. Record: right page, right passage,
  answer agrees. That share is the miss rate of the current reader.
- **Stop if the miss is small.** Keep the light reader. Write the number down so
  the next person does not re-litigate it.
- **Continue only if the miss is large** on real publisher PDFs (your own copies,
  never in git). Then, at **import time only**, reconstruct regions: columns in
  reading order; a callout kept with the rule it sits beside, tagged as example
  or note so a chunk is not an orphan heading. The ask path still receives a
  handful of passages — it does not open the PDF and it does not run a layout
  model per question.
- The light reader stays the default and the fallback. A scan with no text layer
  is still the existing OCR extra, not this stage.
- Page pictures stay. Layout understanding must not become an excuse to hide the
  original page from the player.

**Acceptance:** the eval slice exists and has been run on at least one simple and
one dense rulebook; the miss rate is written down; either we keep the current
reader with that number as the reason, or a layout-aware import raises that
slice without dropping ordinary heading-based questions; `pnpm verify` passes.

---

## Stage 7 — Images and polish

**Goal:** "put the cards here" with the place actually shown.

- Cropping figures out of pages instead of whole renders
- An optional vision model describes the cropped diagrams during ingestion
- The `figure` frame sent by the backend based on the **actually retrieved** sources
- Crops are addressed the same way as page renders — a path under `/api/engine/static`,
  so they stay behind the one door (D10) and inherit its caching
- A citation preview when a source is clicked
- If answers start being rendered as Markdown, no `dangerouslySetInnerHTML` without
  sanitisation. Today React escapes everything for us, which is why model output can be
  dropped into the page safely — that protection ends the moment a renderer is added.

**Acceptance:** a question about setting up the game shows the right diagram, and the
`rejectedFigureCount` counter stays at zero in normal operation.

---

## Stage 8 — Online rules lookup

**Goal:** when the local documents do not answer the question, let the user choose to
search the internet — without leaking anything personal.

- A "Search online" button appears **only** when the model answers
  `insufficient_evidence` or `partial` — never automatically, always by user action
- The query sent to the internet is **only** the game title and the rules question,
  stripped of any session or personal context
- Search is scoped to trusted sources: BoardGameGeek, official publisher sites, and
  curated rules-clarification forums
- Results are saved locally as documents (`documentKind: "faq"`) so the same question
  works offline next time
- The feature is **opt-in per game** in settings: a user who wants a fully offline
  experience never sees the button
- Network requests go through a dedicated module with an allowlist of domains — no
  arbitrary URLs can be reached
- The privacy policy is explicit: only the game name and rule question leave the machine,
  and only when the user clicks the button

**Acceptance:** a question that cannot be answered from local documents shows a "Search
online" option; clicking it finds a relevant BGG thread; the answer is then available
offline; and disabling online search in settings hides the button entirely.

---

## Stage 9 — Context window strategy

**Goal:** decide how large the model’s reading window should be **once** the prompt
is no longer “question + a handful of passages”.

Do this **after the main product** (Stage 3D thread, Stage 4 teaching, Stage 5 voice,
Stage 6 eval). Today `num_ctx` is the profile’s `context_tokens` (8192 on 32 GB) so
two models fit in RAM (D16). Growing it too early only costs memory. After a
scrollable thread and teaching turns, the risk is the opposite: the window silently
drops the system prompt or the first sources.

- Measure real prompt size: system + sources + **kept thread**, on 32 GB and on the
  64 GB profile.
- Write the rule: what we never truncate (system prompt, the passages for *this*
  question); what we may drop or summarise (old turns); when we raise `num_ctx` vs
  when we shrink the thread instead.
- Re-run Stage 6 after any change. A larger window that mixes two games or eats the
  authority order is a regression.

**Acceptance:** the rule is written down and implemented; a long thread still answers
from the current question’s sources; eval does not drop vs the Stage 6 baseline;
`pnpm verify` passes.

---

## Stage 9A — When models load and when they leave memory

**Goal:** the packaged app does not keep the big answer model in RAM unless the
player is about to ask — and the next question at the table still does not wait for
a reload from disk.

Do this **after the app is otherwise done** (including 3B, so first-run already has
models on disk). Today we pin embed + chat during “preparing the assistant” and keep
them ~30 minutes (D16). That helped the second question; it also makes every engine
start heavier and holds RAM while someone only adds a PDF.

- Decide, in the UI, three moments: **importing a rulebook** (need search vectors,
  not a long chat load); **first Ask** (load the answer model, show a plain wait if
  it is not ready); **idle at the table** (keep both long enough for the next
  question; then unload so the laptop can rest).
- Do not tell the player to run a command or pick a model. Status copy stays in
  `en`/`pl`.
- Optional later: run embeddings outside the chat runtime so looking up a question
  does not kick the answer model out of memory. Only if Stage 9A still sees that
  swap on 32 GB.

**Acceptance:** adding a PDF does not wait on the full chat model; the first question
after a pause either answers promptly or shows an in-app “loading the assistant”
state, then works; after a long idle, RAM is released and the next question recovers
in the UI; `pnpm verify` passes.

---

## The order, if you want results fastest

Stages 1 → 2 → 2A → 3 give you **a working rules arbiter over text**, and that is a
natural stopping point for development. **Stage 3E is the next slice on that
arbiter:** think only when sources conflict, so easy questions stay fast. Stage 3D
(the scrollable, per-game thread) is what makes that arbiter usable **at the
table** — you can look back, and sound is optional. Stage 0A–0C (hardening, desktop
window, release) are already done; they sit under the numbered product stages.
Stage 3B is what makes that arbiter usable from the packaged app (Ollama + models
behind a one-click gate). Stage 6 is worth doing right after 3 — before you start
tuning prompts, because otherwise you are tuning by feel. Stage 6A (page layout)
comes **after that measurement**: first learn how often columns and sidenotes cost
us an answer, then decide whether a heavier import is worth it. Voice (5) and
images (7) polish the experience; they are not a condition of usefulness. Online
lookup (8) comes last because the app should be fully useful offline first —
internet is a convenience, not a requirement. Stage 9 (context window) and 9A
(when models sit in RAM) wait until that product exists; growing the window or
rewriting load/unload earlier is guessing.
