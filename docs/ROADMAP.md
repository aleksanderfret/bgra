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
- FastAPI · Python 3.13 · uv, with `mypy --strict` and `ruff`
- A shared contract with a reference SSE decoder and a parity test
- Interface in Polish and English (i18next), no user-facing string hardcoded
- Tests including the guarantee that invented image references are rejected

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

**Acceptance:** `curl` against `/ask` returns a model-generated answer, token by token;
`/health` reports `degraded` naming the missing model when one is absent.

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

**Acceptance:** after ingesting two or three games (one simple, one complex — decision
Z5) `/games` returns them with a non-zero `chunkCount`, and `storage/assets/<gameId>/`
contains the rendered pages.

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
- The `sources` frame sent **before** the first token
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
- Session state keyed by `sessionId`: the model remembers where in the lesson you are
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
- Next.js listens on `0.0.0.0`, the Python engine still only on `127.0.0.1`; a simple
  access check is added to the proxy

**Acceptance:** a spoken question produces a spoken answer; the first sound arrives
before the model finishes generating; **the microphone works on the tablet**, not only on
the Mac.

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
- A citation preview when a source is clicked

**Acceptance:** a question about setting up the game shows the right diagram, and the
`rejectedFigureCount` counter stays at zero in normal operation.

---

## The order, if you want results fastest

Stages 1 → 2 → 3 give you **a working rules arbiter over text**, and that is a natural
stopping point. Stage 6 is worth doing right after 3 — before you start tuning prompts,
because otherwise you are tuning by feel. Voice (5) and images (7) polish the experience;
they are not a condition of usefulness.
