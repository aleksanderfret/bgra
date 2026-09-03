# Architecture and plan audit

This document has two parts: an **audit** of the original plan (what did not hold up and
why) and the **target architecture** together with the reasoning behind the decisions.

---

## 1. Verdict

The backbone of the plan is sound and has been kept: RAG instead of fine-tuning a model,
separating facts from teaching style, a polyglot monorepo with Next.js on the front and
Python in the AI layer, everything local on Apple Silicon. These are the right calls and
there was no reason to change them.

The plan was **not fit**, however, to be handed to an agent as-is. It contained errors
that would have stopped execution, and — more seriously — gaps that would have produced
an application that runs but **gives wrong answers about the rules**. The second kind is
the more dangerous, because it does not announce itself as a failure.

---

## 2. Audit: blocking errors

These would have blown up on the first run.

| # | Problem in the plan | Consequence | Resolution |
| --- | --- | --- | --- |
| 1 | `turbo.json` with a `pipeline` key | Turborepo 2.x rejects the config; `pipeline` was removed in version 2 | The `tasks` key |
| 2 | `"dev": "source .venv/bin/activate && uvicorn ..."` | `source` does not exist in `sh`, which npm uses to run scripts | `uv run uvicorn ...` — no activation, no `bash -c` |
| 3 | `YouTubeTranscriptApi.get_transcript(...)` | Static method removed in `youtube-transcript-api` 1.x | Instance + `.fetch()` (stage 2) |
| 4 | `response.status_status` in the PDF download | `AttributeError` | Code rewritten from scratch (stage 2) |
| 5 | `create-next-app --eslint` while also choosing Biome | Two competing linters; on top of that no `--no-tailwind` | `--biome --no-tailwind`, one linter across the repo |
| 6 | `nomic-embed-text` as the embedding model | An anglocentric model. A Polish question against an English rulebook **will not hit** the right passage — a silent loss of relevance | `bge-m3`, multilingual, cross-lingual search |
| 7 | `whisper-cpp-py`, `kokoro-onnx` in `requirements.txt` | Packages with uncertain maintenance; risky to install | `mlx-whisper` (Apple MLX, native Metal) and `piper-tts` |
| 8 | `allow_origins=["*"]` together with `allow_credentials=True` | The browser rejects that combination per the spec | No CORS at all — see decision D2 |
| 9 | The frontend called `http://localhost:8000` directly, even though the structure assumed a proxy | Inconsistency: the proxy existed only on the diagram | Everything through `/api/engine/*` |
| 10 | "BGG offers an API you can pull the files section (Files/Rules) from" | Untrue. XMLAPI2 does not expose the files section, and an automated downloader for it would breach the terms of service | You download rulebooks manually from legal sources; the repo provides ingestion, not bulk downloading |

The plan itself had already caught three things correctly: a broken SSE parser, the
missing Polish phonemiser in Kokoro-TTS, and the lack of a fallback path for YouTube
subtitles. Those fixes were kept.

---

## 3. Audit: architectural gaps

These are not syntax errors but things whose absence yields a **working application that
gets the rules wrong**.

### 3.1. No per-game scoping of retrieval — gap no. 1

In the plan all documents went into one vector store with no mandatory filter. The
question "how many cards do I draw in the combat phase?" with twenty games indexed will
pull passages from several different rulebooks, and the model will merge them into a
single answer that sounds credible and is false.

**Resolution:** `gameId` is a required request field (`AskRequest`), validated
server-side. Optional `expansionIds` may widen the scope only to games whose
`baseGameId` equals that `gameId`. The metadata filter for the **active game set**
is applied **before** retrieval, not after. The contract enforces this at the type
level, and the test `test_ask_rejects_a_question_without_a_game` guards the required
base id (Stage 2B adds validation for expansions).

### 3.2. No document authority hierarchy

Errata exist precisely because rulebooks get things wrong. The plan treated the rulebook,
the FAQ and the errata as equivalent text, so on a contradiction the winner was whichever
passage happened to score higher on similarity.

**Resolution:** every chunk carries a `documentKind`, and the constant
`DOCUMENT_AUTHORITY` fixes the order: `video_transcript < player_aid < rulebook < faq <
errata`. On a conflict the prompt tells the model to follow the higher-authority document
and to say outright that an errata changed the rule. The order is identical on both sides
— `test_document_authority_order_matches` guards that. When two documents share the same
kind (e.g. two rulebooks), prefer the newer `indexedAt` and expose `documentTitle` in
`sources` (Stage 2B).

YouTube transcripts have the **lowest** authority on purpose: they supply style, not
rules. A youtuber may be wrong, or playing with an old errata.

### 3.3. A `[SHOW_IMAGE: path]` marker inside the answer text

This was the most serious design error. The plan had the model write a file path inside
the generated text. A language model **invents paths** — that is exactly the kind of data
it hallucinates most eagerly. The frontend would then display a random image or an empty
frame, and the marker can also be torn apart across two stream tokens.

**Resolution:** images are controlled by the backend, not by the model.

1. The backend sends a `sources` frame **before** the first token — a closed list of
   evidence with ids and image URLs.
2. The model may point at a figure only by its id, in a separate `figure` frame.
3. The frontend displays an image **only** when the id is present in the `sources` list
   it received and that source carries an image. An invented reference is rejected and
   counted in `rejectedFigureCount`.

So an invented path is not "handled" — it is **impossible to display**. The guarantee is
described by the tests in `apps/web/src/features/rules-chat/answer-state.test.ts`.

### 3.4. No reranking and no hybrid retrieval

The plan had a single step: vector similarity, `top_k` passages, done. For rules
questions that is not enough, for two reasons:

- **Rulebooks are full of proper nouns** ("Rebirth Phase", "Supply tile"). Semantic
  search loses exact matches; classic BM25 is needed too. LanceDB supports both, so we
  fuse the results.
- **Similarity ≠ relevance.** A cross-encoder (`bge-reranker-v2-m3`) rescores
  question–passage pairs and reorders them. This is the single largest quality gain in
  RAG over technical documents.

Hence three stages: fetch ~40 candidates hybridly → filter through the reranker → keep 6.
The values live in configuration (`retrieval_candidates`, `retrieval_top_k`).

### 3.5. No relevance threshold and no "I don't know" state

The plan told the model "answer only from the passages", but nothing checked whether the
passages made any sense at all. Retrieval **always** returns something, even if the best
hit is completely off topic — and a model handed inadequate context will still formulate
an answer.

**Resolution:** `min_relevance_score` cuts off weak hits, and `Groundedness`
(`grounded` / `partial` / `insufficient_evidence`) is part of the contract and a separate
message in the interface. A lack of coverage is a result, not an error.

### 3.6. No evaluation set — the largest omission in the whole plan

The plan had **no** way of establishing whether the assistant answers correctly. In a
system like this, every change to the prompt, the chunk size or the model is guesswork:
you fix one question, break three others, and never find out.

**Resolution:** stage 6 is a set of 30–50 questions per game with a hand-written correct
answer and a page number. We measure three things:

- **retrieval accuracy** — did the right page make it into the results,
- **answer agreement** — is the answer consistent with the reference,
- **correct refusals** — questions outside the rulebook, which the assistant **must**
  decline.

That third group is the most important and the most commonly skipped.

### 3.7. Extracting images from PDFs

The plan improved on a naive `page.get_images()` with a size filter, which is a good
start, but it still pulls background elements and misses diagrams made of vectors (and
almost every setup diagram is one).

**A layered resolution:** the baseline is **rendering the whole page** to PNG at 150 DPI
— always correct and always sufficient for "look here", because we have the page number.
Cropping individual figures is a later improvement, not a foundation.

### 3.8. Heavy PDF parsers

`Marker` and `Unstructured` drag in PyTorch and several GB of models, in order to cope
with scans. Publisher rulebooks are almost always PDFs with a text layer.

**Resolution:** `pymupdf4llm` by default (lightweight, returns Markdown with headings, no
model at all). The heavy OCR parser is enabled only for a specific scan.

### 3.9. The voice layer

The plan sent the whole recording once the utterance ended and waited for the whole
answer. At the table that is too slow, and in a noisy room — unreliable.

**Resolution:** *push-to-talk* as the default mode (noise-resistant, predictable),
TTS streamed sentence by sentence instead of waiting for the full answer, and a visible
transcript of the question so a mishearing is immediately apparent.

### 3.10. The microphone when accessed from a tablet

If the assistant is to be used from a tablet on the local network, `getUserMedia` **will
not work** over plain HTTP — the browser requires a secure context. The plan did not
account for this. The resolution (a local certificate or a tunnel) belongs to stage 5 and
depends on the answer to open question O3.

---

## 4. Target architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 16, React 19, Mantine 9, TypeScript 7        │
│                                                                  │
│  push-to-talk ──► POST /api/engine/ask ──► SSE                   │
│  answer ◄── state reducer ◄── frame decoder                      │
│                     │                                            │
│                     └─► image ONLY from the `sources` list       │
└───────────────────────────────┬──────────────────────────────────┘
                                │ one origin, no CORS
┌───────────────────────────────▼──────────────────────────────────┐
│  services/rag-engine — FastAPI, Python 3.14                      │
│                                                                  │
│  Whisper (mlx) ──► question text                                 │
│         │                                                        │
│         ▼                                                        │
│  retrieval:  gameId filter ──► BM25 + vectors ──► reranker       │
│         │                              │                         │
│         │                              ▼                         │
│         │                relevance threshold ──► "I don't know"  │
│         ▼                                                        │
│  LLM (Ollama) prompted with: context only + document hierarchy   │
│         │                                                        │
│         ▼                                                        │
│  Piper TTS (Polish voice) ──► audio streamed sentence by sentence│
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  Ingestion (run manually, not at startup)                        │
│  PDF ──► pymupdf4llm ──► Markdown + page renders                 │
│  YouTube ──► subtitles, fallback yt-dlp + Whisper                │
│  ──► split on headings ──► LanceDB (vectors + BM25)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Decision log

**D1 — The API contract as a separate package.**
`packages/api-contract` holds the TypeScript types and a reference SSE decoder; Python
mirrors them in `contract.py`. The parity test reads the `.ts` file and compares both
event sets. Without it, adding an event on one side shows up as a stream the browser
quietly ignores.

**D2 — Everything through the Next.js proxy, zero CORS.**
The browser does not know the engine's address. What we gain: no CORS configuration, one
origin for images and audio, the Python port still bound to `127.0.0.1` only, and one
place for access control once a tablet on the local network arrives.

**D3 — Model profiles in configuration, not in code.**
You build on 32 GB and will end up with 64 GB. A profile is a named set of models
(`starter-32gb`, `full-64gb`) selected with the `BGA_MODEL_PROFILE` variable. Moving to a
new machine is a one-line change.

**D4 — An MoE model as the main one on the target hardware.**
For spoken conversation what counts is time to first sound, not a benchmark score.
Qwen3 30B-A3B activates ~3 billion parameters per token, so it answers fast at a quality
close to a 30B model. A 70B model would fit in 64 GB but leaves no headroom for the
context cache, Whisper and TTS at the same time — so instead there is `llm_arbiter`: a
stronger model invoked purely to settle disputes, where a few extra seconds do not
matter.

**D5 — Heavy dependencies in optional groups.**
`uv sync` for the harness takes seconds. You install `ingest`, `retrieval` and `speech`
as you enter each stage. On a 1 TB disk that is a convenience; on the current one, with
74 GB free — a necessity.

**D6 — Biome instead of ESLint (and not just for speed).**
TypeScript 7.0 does not yet expose a programmatic API (due in 7.1), which **blocks**
`typescript-eslint`. Biome does not use that API, so choosing Biome is what makes a TS 7
stack coherent today. Next.js 16.3 runs type checking through the local `tsc` CLI —
checking the whole application takes ~300 ms.

**D7 — The `/ask` stub says "I don't know".**
The default behaviour of an empty system is `insufficient_evidence`. This is not a stub
for its own sake: the frontend can be built and tested in full before the first model is
on disk, and the most important path — an honest refusal — is exercised from day one.
The stub does not stream prose; it emits a `notice` frame carrying a code, and the
frontend renders the translated text (see D8).

**D8 — User-facing text lives in the frontend, never in the engine or the model.**
Every string the user reads comes from `apps/web/src/i18n/locales/<locale>/common.json`. The
engine reports machine-readable codes — `NoticeEvent.code`, `ErrorEvent.code` — and the
frontend maps them to translated copy; `ErrorEvent.message` stays an English technical
detail for the log, not for the screen. This is the same discipline as D1 applied to
words: text that crosses the process boundary would otherwise pin the interface to one
language and put UI copy in Python. The active language is a URL segment (`/pl`, `/en`),
so `<html lang>` and the page metadata are correct on the server render.

**D9 — "Local" is a binding, not a hope.**
`next dev` and `next start` default to `0.0.0.0`; left alone, the very first `pnpm dev`
publishes an unauthenticated assistant to every device on the network. Both scripts pass
`--hostname 127.0.0.1`, so reaching the LAN is a deliberate act (stage 5) rather than the
default. The engine is bound the same way and is not published at all.

**D10 — One chokepoint, and no way around it.**
Everything the browser fetches from the engine — answers, page renders, audio — goes
through `apps/web/src/app/api/engine/[...path]/route.ts`. A `rewrites()` entry in
`next.config.ts` would be faster and would also route straight past that handler, so
there is none, on purpose. The handler holds an empty `assertMayReachEngine` seam: the
place stage 5 fills in, chosen now so that adding auth is one function and not an audit.

Three rules follow from having a single door:

- **Headers are allowlisted in both directions** (`src/lib/engine-proxy.ts`). The engine
  cannot verify a cookie or a bearer token, so it never receives one; conversely it may
  not set a cookie or redirect the browser.
- **The engine never hands the browser a URL it can use as-is.** `RetrievedSource.imageUrl`
  is relative to the engine root (`/static/assets/...`); the frontend adds the proxy
  prefix in `engineAssetUrl`. So the engine does not need to know how Next routes, and an
  absolute URL — which would fetch around this handler — is dropped by the answer reducer
  rather than rendered.
- **Path segments are validated and encoded individually**, so `..` cannot climb out of
  the engine's routes.

**D11 — A cancelled question stops costing.**
`request.signal` is passed to the upstream `fetch`, so closing the tab or asking again
stops generation instead of leaving the model running on the GPU for an answer nobody
will read. The streaming route has no deadline — a long answer is normal — while `/games`
and `/health` get 10 seconds, because a stalled one of those is a bug, not patience.

**D12 — `gameId` is a slug on both sides.**
It is simultaneously the retrieval filter (invariant 1) and a directory name under
`storage/assets`, which makes it the one value where a validation gap becomes path
traversal. `^[a-z0-9][a-z0-9-]{0,63}$` is enforced by Pydantic on `AskRequest` and
`GameSummary`, exposed as `isGameId` in the contract package, and — like the event set in
D1 — checked for drift by `test_contract_parity.py`. A pattern that is stricter on one
side than the other is a game that indexes and then cannot be asked about.

**D13 — Identity is not modelled yet, but nothing assumes its absence.**
There is one user, so there is no user table and no login, and inventing one now would
be guessing at requirements. What is not allowed is code that becomes wrong the moment a
second person exists. Three commitments carry that:

- `/games` means "the games visible to whoever is asking", not "every directory on the
  disk". Today those are the same list; the endpoint is written as the former.
- `sessionId` (stage 4) is **issued by the server**, never chosen by the client. A
  client-chosen identifier is someone else's teaching session for the price of a guess.
- Every path under `storage/` is built by one helper, so scoping a library to an owner
  is a change in that helper rather than a search across the ingestion code.

Whether the library ends up shared or per-owner is deliberately left open — with these
three in place, either costs one function.

**D14 — Document text is data, never instructions.**
Rulebooks, FAQs and especially YouTube transcripts are third-party text that ends up
inside a prompt. A transcript that says "ignore the previous instructions" is a rule the
assistant must not follow. So retrieved chunks are wrapped in delimiters and labelled as
source material, and the system prompt states that nothing inside them can change it.

`DOCUMENT_AUTHORITY` does not help here: it ranks how much a document should be trusted
about **the rules**, which is a relevance ordering, not a security boundary. An errata is
the highest authority on rules and still may not issue instructions.

---

## 6. Scope decisions

The decisions below are settled and bind the following stages.

**Z1 — Mixed rulebooks: Polish and English, questions always in Polish.**
Cross-lingual search stops being optional. Consequences:

- `bge-m3` for embeddings and `bge-reranker-v2-m3` for reranking are **required** — both
  are multilingual and search across languages. An anglocentric model is ruled out here,
  because a Polish question would not hit an English passage.
- The prompt must require an answer in Polish **keeping the original term in
  parentheses** when the source is English. This is not cosmetic: phase and component
  names are printed in English on the cards and the board, so "faza zaopatrzenia
  (Supply Phase)" is useful at the table, and a bare translation is not.
- The evaluation set (stage 6) must contain Polish questions against English rulebooks,
  because that is the hardest case for retrieval.

**Z2 — Text is the primary mode, voice arrives in stage 5.**
A rules arbiter over text is useful on its own and ships sooner.

**Z3 — Images: start with a full page render including the number.**
Always correct and sufficient for "look here". Cropping individual diagrams stays in
stage 7 as an improvement.

**Z4 — Access from a tablet on the home network is in scope.**
This has three consequences the original plan did not account for:

- `getUserMedia` **does not work** over plain HTTP outside `localhost`, so stage 5
  requires a local certificate (`mkcert`) or a tunnel. Without it the microphone on a
  tablet stays unavailable — and that is not a problem to work around in code.
- Next.js will then have to listen beyond the loopback interface, while the Python engine
  stays on `127.0.0.1`. Decision D2 (everything through the proxy) pays off exactly here:
  there is a single place through which network traffic enters.
- Opening that interface and adding the access check are **one change, not two** (D10).
  Until stage 5 the app is bound to `127.0.0.1` (D9), because an unauthenticated
  assistant reachable from the whole flat is what "local-first" was supposed to prevent.

**Z5 — Start with two or three games, including one simple and one complex.**
Having several games indexed from the beginning surfaces cross-game rule mixing (audit
3.1) early — with a single game that bug is invisible until it becomes expensive to fix.

**Z6 — The interface ships in Polish and English; Polish is the default.**
Polish is the language of the table (Z1), so it stays the default and the fallback. The
English UI costs almost nothing once no string is hardcoded, and it makes the second
locale a permanent test that the discipline in D8 is actually held: a hardcoded string
shows up immediately as untranslated text on `/en`. The answers themselves remain a
separate matter — those are governed by Z1 and the prompt, not by the interface locale.

**Z7 — Streaming is paced for the machine that is also running the model.**
Tokens arrive faster than a screen can usefully repaint, and the same laptop is busy
generating them. `useAskStream` coalesces token frames on a 50 ms timer; every other
frame paints at once, because `sources` before the first word (invariant 3) and an error
instead of an answer are correctness, not smoothness. The pending flush is cancelled when
an answer is superseded or cancelled, so a stale batch cannot repaint a discarded answer.

**Z8 — The threat model, stated so it can be checked.**
Everything above is only coherent against a written answer to "trusted by whom".

| | Trusted | Why it matters |
| --- | --- | --- |
| The person at the keyboard | Yes | One household, one machine — hence no login today (D13) |
| Other devices on the home network | Not until stage 5, and then only past the guard | Which is why `127.0.0.1` is the binding, not a preference (D9) |
| The internet | No, and it is not reachable | The engine is never published; only Next may ever be |
| Rulebooks, FAQs, transcripts | As **data**, never as instructions | Third-party text inside a prompt (D14) |
| The model's own output | No | It may name a source id, never a path (invariant 2) |
| Electron preload bridge | Read-only by design | `contextBridge` exposes only setup/diagnostics/import helpers; no Node, no arbitrary IPC. Relevant once stage 7 renders model Markdown — keep the surface minimal so document text cannot reach privileged APIs |

The engine never leaves `127.0.0.1` under any of these. The only process that may ever
be exposed is Next, and only behind `assertMayReachEngine`.

**D15 — Desktop shell runs Next as a local server, not as a static export.**
Electron's `BrowserWindow` loads `http://127.0.0.1:<port>` where that port is a
`next start` (or standalone `server.js`) child of the main process. The `/api/engine/*`
proxy, `proxy.ts` locale redirect, and RSC layouts stay intact — a static export would
force the renderer to talk to Python directly and bypass `assertMayReachEngine` (D10).
The Python environment is created under `app.getPath('userData')` via a resolved `uv`
binary (never via PATH alone: a Dock-launched app has no shell PATH). Storage is the
same `BGA_STORAGE_DIR` root, pointed at userData so an auto-update cannot wipe the
index. Packaging (`electron-builder`) is a separate `package` script, outside
`pnpm verify`, so `git push` does not build installers. Unsigned builds are enough for
a handful of testers; code signing and notarisation wait until distribution is a real
goal. Sharing packaged indexes between users is deliberately unsupported: an index
contains rulebook text and page renders.

---

## 7. Annex: what changes on a remote server

Nothing in the retrieval path. The index is data — `storage/lancedb` and
`storage/assets` copy across and the assistant knows exactly the same rules, because
nothing was ever trained (that is the whole point of RAG over fine-tuning). Four things
do change, and they are the reason this is not a deployment target today.

| Assumption that stops holding | Consequence |
| --- | --- |
| One trusted user | `assertMayReachEngine` (D10) has to become a real check, and `storage/games.json` a per-owner library rather than a global one |
| Loopback binding (D9) | Needs TLS in front, and the engine port must stay unreachable from outside the host |
| Apple Silicon | `mlx-whisper` is MLX-only; a Linux box needs `faster-whisper` behind the same interface, which is why the model choice lives in `settings.py` profiles (D3) |
| A GPU per household | Concurrent generations queue on one model; the request timeout in D11 is tuned for a single user and would need a queue instead |
| One log reader who was also the only user | Logs need a request identifier to be readable at all once answers interleave |
| `storage/` sitting next to the code | It becomes a mounted volume with its own lifecycle, so `storage_dir` has to stay the single configured root it already is, never a path assembled at a call site |

The order matters: identity comes first. Every other item is a configuration change,
while retrofitting a notion of "whose library is this" touches the storage layout, the
registry and the retrieval filter at once.
