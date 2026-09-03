# BGA — a local board game rules assistant

A private assistant that **teaches board game rules** and **settles disputes at the
table** — based on the rulebooks, FAQs and errata you put on your own disk. The end goal
is that you talk to it, and it shows you the right part of the rulebook on screen.

**No question and no document ever leaves your computer.** Answering is fully offline:
the models run locally and there is no external API in the request path. The network is
used twice, both times outside answering — installing the models, and fetching a YouTube
transcript if you ask for one during ingestion. The app itself listens on `127.0.0.1`
only, so nothing on your network can reach it until you decide otherwise.

---

## What it is for

Two deliberately different scenarios:

| Mode | When | Behaviour |
| --- | --- | --- |
| **Teach me the game** | You just unboxed something new | Runs a lesson: goal → theme → mechanics → turn structure → a sample move, in small portions, with comprehension checks |
| **Settle a rule** | An argument mid-game | A short, exact answer with the rulebook page |

## How it works

The model **does not memorise the rules**. Instead, for every question it searches your
local document store and answers only from the passages it found. This is the **RAG**
pattern (Retrieval-Augmented Generation).

```
                      ┌─────────────────────────────────────┐
  microphone ────────►│ 1. Speech recognition (Whisper)     │
                      └──────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────────────┐
                      │ 2. Search the document store        │
                      │    • scoped to ONE game             │
                      │    • hybrid: keywords + meaning     │
                      │    • filtered through a reranker    │
                      └──────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────────────┐
                      │ 3. Answer generation (LLM)          │
                      │    only from the supplied passages  │
                      └──────┬───────────────────┬──────────┘
                             ▼                   ▼
              ┌──────────────────────┐  ┌──────────────────────┐
              │ 4. Speech synthesis  │  │ 5. Rulebook image    │
              │    (Piper, Polish)   │  │    + page number     │
              └──────────────────────┘  └──────────────────────┘
```

### Two pillars: facts and style

This separation is the foundation of the whole project:

- **Facts** come from the document store (rulebook, FAQ, errata). The model is not
  allowed to go beyond what it found. If it found nothing — it says it does not know.
- **Teaching style** comes from the system prompt and from transcripts of good YouTube
  tutorials. Transcripts teach the model *how* to explain (ordering, analogies, plain
  language), and are **never** used as a source of rules.

The result is an assistant that speaks as accessibly as a youtuber, but states rules
that match the rulebook.

### What the assistant deliberately does not do

The answer "these documents do not contain that rule" is a **correct outcome**, not a
failure. For a rules arbiter, an invented rule is far worse than admitting ignorance —
which is why a lack of coverage in the sources is its own, visible state in the
interface.

---

## Hardware requirements

Everything comes down to **unified memory** and memory bandwidth — on Apple Silicon
these decide the speed, not the core count.

| Profile | Hardware | Main model | Disk | What it feels like |
| --- | --- | --- | --- | --- |
| `starter-32gb` | M1/M2 Pro, 32 GB | Qwen3 14B (Q4) | ~12 GB | Brisk; build the pipeline on this |
| `full-64gb` | M4/M5 Pro/Max, 64 GB | Qwen3 30B-A3B (MoE) | ~48 GB | Target quality and fluent conversation |

The `full-64gb` profile uses a **mixture-of-experts** model: it has 30 billion
parameters but activates only ~3 billion per token. So it responds at the speed of a
small model while reasoning like a large one — the best compromise for a spoken
conversation, where time to first sound is what matters.

You change the profile in **one env file**, without touching the code:

```bash
cp services/rag-engine/.env.example services/rag-engine/.env
```

Then set `BGA_MODEL_PROFILE=full-64gb` (or leave `starter-32gb`). The file is gitignored.
`./scripts/pull-models.sh` and the engine both read it; a shell export of the same name
overrides it for one command if you need that.

Profile definitions: [`services/rag-engine/rag_engine/settings.py`](services/rag-engine/rag_engine/settings.py).

### How much disk space

| Item | Size |
| --- | --- |
| LLM (14B / 30B, Q4) | 9–20 GB |
| Vision model (optional) | ~6 GB |
| Embeddings + reranker | ~3 GB |
| Speech recognition (Whisper turbo) | ~1.6 GB |
| Polish voice (Piper) | ~60 MB |
| One game: rulebook + images + index | 20–80 MB |

Models never end up in the repository — they are downloaded locally.

---

## Getting started

### Required tools

```bash
node --version   # ≥ 22
corepack enable  # exposes pnpm from package.json
brew install uv  # Python environment manager (installs Python 3.14 itself)
```

The AI engines arrive in later stages — **the harness runs without them**:

```bash
brew install ollama          # stage 3: language model and embeddings
./scripts/pull-models.sh     # downloads the models of the active profile
```

### Install and run

```bash
pnpm install
pnpm dev
```

This starts **both** processes in parallel:

- interface: <http://localhost:3000>
- engine + API documentation: <http://localhost:8000/docs>

The browser talks only to Next.js, which forwards requests to Python under
`/api/engine/*`. One origin, zero CORS configuration, and the engine port is not
exposed to the network.

### Commands

| Command | Effect |
| --- | --- |
| `pnpm dev` | Interface + engine in parallel |
| `pnpm verify` | Types, tests, lint and build across the repo |
| `pnpm preflight` | Lint, types and tests — without a production build |
| `pnpm test` | Tests for every package |
| `pnpm typecheck` | TypeScript 7 + mypy (strict) |
| `pnpm check:fix` | Formatting and auto-fixable Biome rules |
| `pnpm format` | Biome + Ruff formatters, in place |

Git hooks (Husky): **pre-commit** lints and formats only the staged files
(Biome for TypeScript/JSON, Ruff for Python). **pre-push** runs `pnpm verify` —
types, tests, lint and a production build for the whole repo. Disable for one
command with `HUSKY=0` if you have to.

Python lint and format are **Ruff** (replaces Flake8, isort and Black). Types are
**mypy --strict**. Both already run as `rag-engine#lint` and `rag-engine#typecheck`;
the hooks pick them up through Turborepo. There is nothing extra to install for
that stack.

---

## Repository layout

A polyglot monorepo (pnpm workspaces + Turborepo): TypeScript where the interface
matters, Python where the AI ecosystem is mature.

```
bga/
├── apps/web/                 Next.js 16 · React 19 · Mantine 9 · TypeScript 7
│   └── src/
│       ├── app/[locale]/     routing, layout, engine proxy
│       ├── features/         answer and streaming logic
│       └── i18n/             i18next setup and pl/en resources
├── packages/api-contract/    shared TS contract + reference SSE decoder
├── services/rag-engine/      FastAPI · Python 3.14 · uv
│   ├── rag_engine/           API, configuration, model profiles
│   └── storage/              your documents and index (outside git)
├── .cursor/                  committed agent harness (skills, rules, commands)
└── docs/                     architecture and execution plan
```

## Interface language

The UI ships in Polish and English. Nothing user-facing is hardcoded: every string
lives in [`apps/web/src/i18n/locales/`](apps/web/src/i18n/locales), and the active language is
the first path segment (`/pl`, `/en`). Visiting `/` negotiates a language from the
`Accept-Language` header and redirects, so the URL always names the language it is
showing.

## What works today, and what does not

**Works today:** the monorepo, the interface, the full answer-streaming path
(browser → Next.js → FastAPI), an API contract guarded by a parity test, Polish and
English translations, strict lint and types.

**Not yet:** PDF ingestion, retrieval, a connected model, voice. Until then `/ask`
returns a correctly shaped response with the `insufficient_evidence` state — which is
exactly what it should return against an empty store.

The order of work and the acceptance criteria for each stage: [`docs/ROADMAP.md`](docs/ROADMAP.md).
The reasoning behind the decisions and the architecture audit: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Source material

You download the rulebooks yourself, from legal sources (publisher sites offer PDFs for
download) and keep them locally, for your own use. The repository does not contain them
and contains no bulk downloader for services whose terms forbid it.
