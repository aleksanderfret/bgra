# Execution plan

The stages are ordered so that **each one ends with something runnable**, rather than
another layer with no visible effect. The acceptance criteria are written as checkable
facts — they can be handed to an agent as a definition of done.

A rule that applies to every stage: `pnpm verify` must pass before a stage is closed.

---

## Stage 0 — Repository and harness ✅ **complete**

The monorepo, the interface, the streaming flow and the API contract.

- pnpm workspaces + Turborepo, one `pnpm dev` command runs both processes
- Next.js 16.3 · React 19 · Mantine 9 · TypeScript 7 · Vitest 4 · Biome 2.5
- FastAPI · Python 3.14 · uv, with `mypy --strict` and `ruff`
- A shared contract with a reference SSE decoder and a parity test
- Interface in Polish and English (i18next), no user-facing string hardcoded
- Tests including the guarantee that invented image references are rejected
- Hardening that only gets more expensive later: both processes bound to `127.0.0.1`
  (D9), one un-bypassable route to the engine with allowlisted headers and an
  `assertMayReachEngine` seam (D10), upstream cancellation (D11), `gameId` as a slug on
  both sides of the contract (D12), and batched token painting (Z7)

---

## Stage 1 — Running the models locally

**Goal:** the engine actually talks to a model; `/health` tells the truth.

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

## Stage 2 — Document ingestion

**Goal:** a PDF and a video become ordered, addressable material.

- `uv sync --extra ingest`
- PDF → Markdown via `pymupdf4llm`, **preserving page numbers** (without them there are
  no citations)
- Render each page to a 150 DPI PNG in `storage/assets/<gameId>/pNN.png`
- Split on Markdown headings; a chunk never crosses a section boundary
- YouTube subtitles: `youtube-transcript-api` (instance API, `.fetch()`), falling back to
  `yt-dlp` + Whisper when the author disabled subtitles
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

**Acceptance:** after ingesting two or three games (one simple, one complex — decision
Z5) `/games` returns them with a non-zero `chunkCount`, `storage/assets/<gameId>/`
contains the rendered pages, and ingesting under a `--game` like `../x` fails before
anything is written.

---

## Stage 3 — Retrieval

**Goal:** answers grounded in the documents, citing the page.

- `uv sync --extra retrieval`; LanceDB in `storage/index`
- Chunk schema: `id`, `gameId`, `documentKind`, `page`, `text`, `heading`, vector
- A **mandatory** `gameId` filter before retrieval (see audit 3.1)
- Hybrid retrieval: BM25 + vector, results fused
- Cross-encoder reranking, `retrieval_candidates` → `retrieval_top_k`
- A `min_relevance_score` threshold; below it → `insufficient_evidence` without calling
  the model
- A prompt carrying the `DOCUMENT_AUTHORITY` hierarchy and a ban on leaving the context
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
invented rule; a question about game A never returns passages from game B.

---

## Stage 4 — Teaching mode

**Goal:** the assistant teaches rather than merely answering.

- Separate prompts for `teach` and `arbitrate`
- Teaching style drawn from tutorial transcripts, supplied as an example in the system
  prompt, **marked as not being a source of rules**
- Session state keyed by `sessionId`, **issued by the server and given a TTL** (D13). A
  client-chosen identifier would be someone else's lesson for the price of a guess — the
  cost of getting this right is nil today and considerable once anyone else can connect.
- Lesson structure: goal → theme → mechanics → turn → sample move, with a comprehension
  check after each module

**Acceptance:** a "teach me this game" conversation walks through the modules without
dumping everything at once, and switching to `arbitrate` mid-session produces a short
answer with a citation.

---

## Stage 5 — Voice

**Goal:** a conversation without a keyboard.

- `uv sync --extra speech`
- Push-to-talk in the browser (`MediaRecorder`), transcription via `mlx-whisper`
- The `transcript` frame shows what it heard before it answers
- Piper with a Polish voice, audio streamed **sentence by sentence** — not after the
  whole answer is generated
- **A local HTTPS setup is required** (`mkcert`), because the assistant is meant to work
  from a tablet on the home network, and `getUserMedia` does not work over HTTP outside
  `localhost` (decision Z4)
- Opening the LAN interface is **one change with the access check**, not a step before
  it: Next.js stops binding `127.0.0.1` (D9) only in the same commit that fills in
  `assertMayReachEngine` (D10). The Python engine stays on `127.0.0.1` either way.
- With HTTPS in place, the report-only CSP becomes enforcing, and `Strict-Transport-
  Security` is added. Mantine's inline styles and `ColorSchemeScript` need nonces first,
  which is why the policy is only recording today.
- Recorded audio goes through the same proxy as everything else; `Permissions-Policy`
  already limits the microphone to this origin

**Acceptance:** a spoken question produces a spoken answer; the first sound arrives
before the model finishes generating; **the microphone works on the tablet**, not only on
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

## The order, if you want results fastest

Stages 1 → 2 → 3 give you **a working rules arbiter over text**, and that is a natural
stopping point. Stage 6 is worth doing right after 3 — before you start tuning prompts,
because otherwise you are tuning by feel. Voice (5) and images (7) polish the experience;
they are not a condition of usefulness.
