# BGA — Board Game Assistant

A private, offline assistant that **teaches board game rules** and **settles rules questions at the table** using your own rulebooks and FAQs. The goal is simple: you ask a question out loud, and the assistant answers you while showing the relevant page from the rulebook on screen.

**Everything stays on your computer.** The assistant works completely offline once set up. No questions, game notes, or personal documents are ever sent to external cloud servers or third-party APIs.

---

## Table of Contents

- [What this assistant does](#what-this-assistant-does)
- [How it works (in simple words)](#how-it-works-in-simple-words)
- [Hardware requirements](#hardware-requirements)
- [Releases and downloads](#releases-and-downloads)
- [Running from source](#running-from-source)
- [Everyday commands](#everyday-commands)
- [Project structure](#project-structure)
- [Languages](#languages)
- [Current status](#current-status)
- [Source material and privacy](#source-material-and-privacy)

---

## What this assistant does

The assistant covers two common situations:

| Situation | When to use it | What it does |
| --- | --- | --- |
| **Teach me the game** | When opening a new game for the first time | Guides you step-by-step: goal of the game, theme, main actions, turn order, and a sample move, checking understanding along the way. |
| **Settle a rule** | During a game dispute | Gives a short, definitive answer citing the exact page and paragraph from the official rulebook. |

---

## How it works (in simple words)

Traditional AI models often guess or invent details when they are not sure. BGA avoids this by following a strict principle: **it never guesses rules from memory**.

Instead, every time you ask a question, the assistant:
1. Listens to your voice through the microphone.
2. Searches through the actual PDF rulebooks, FAQs, and official errata on your hard drive for that specific game.
3. Reads the matching paragraphs and answers strictly based on that text.
4. Shows the actual page from the rulebook on screen so everyone at the table can verify it.

```text
  Microphone
      │
      ▼
  1. Speech recognition (transcribes your voice locally)
      │
      ▼
  2. Document search (finds relevant pages in your local rulebook)
      │
      ▼
  3. Answer generation (summarises the rule using ONLY those pages)
      │
      ├───────────────────────────────┐
      ▼                               ▼
  4. Spoken answer (local voice)   5. Rulebook page on screen
```

### Facts vs. teaching style

- **Facts** come exclusively from official rulebooks and errata. If the rulebook does not mention a situation, the assistant admits it does not know instead of inventing a rule.
- **Teaching style** comes from transcripts of board game video tutorials. These tutorials teach the assistant *how* to explain concepts clearly, but they are never used as a source of official rules.

---

## Hardware requirements

Because the assistant runs locally on your computer without external cloud servers, it relies on your computer's memory (RAM). On modern Apple Silicon Macs (M1/M2/M3/M4), memory is shared between the processor and graphics, which makes local AI run fast.

| Memory profile | Recommended computer | How it feels |
| --- | --- | --- |
| `minimal-16gb` | 16 GB RAM (MacBook Air / M1 / M2) | Answers rules well; explanations are simpler. |
| `starter-32gb` | 32 GB RAM (MacBook Pro / Pro chips) | **Recommended default:** quick responses, smooth flow. |
| `full-64gb` | 64 GB+ RAM (Max or Ultra chips) | Best quality and natural, fluent conversation. |

### Disk space

- **AI models:** 10–25 GB (downloaded once to your machine, never committed to git).
- **Voice synthesis (speech):** ~1.6 GB.
- **Game rulebooks & indexes:** 20–80 MB per game.

To choose your hardware profile, copy the example environment file:

```bash
cp services/rag-engine/.env.example services/rag-engine/.env
```

Set `BGA_MODEL_PROFILE=starter-32gb` (or `minimal-16gb` / `full-64gb`).

---

## Releases and downloads

We provide ready-to-run desktop application packages for macOS (Apple Silicon / arm64).

### Downloading the app

1. Go to the [Releases](https://github.com/aleksanderfret/bgra/releases) section on GitHub.
2. Download the latest `.dmg` or `.zip` installer (e.g. `BGA-x.y.z-arm64.dmg`).
3. Open the downloaded file and drag **BGA** into your Applications folder.

### What you need installed on your Mac

The packaged application runs the user interface and local server, but expects two helper tools to be installed on your computer:

1. **[Ollama](https://ollama.com/)** — runs the local AI language models.
2. **[uv](https://docs.astral.sh/uv/)** — runs the Python rules search engine.

You can install both quickly using [Homebrew](https://brew.sh/):

```bash
brew install ollama
brew install uv
```

Before first use, start Ollama and download the models for your chosen profile:

```bash
./scripts/pull-models.sh
```

### macOS security notice (unsigned build)

Because these are early community test builds without an expensive Apple Developer certificate:
- macOS Gatekeeper may show a warning: *"BGA cannot be opened because the developer cannot be verified"*.
- **To open it:** Right-click (or Control-click) the **BGA** app icon in Finder, choose **Open**, and click **Open** in the confirmation dialog. You only need to do this once.

### For developers: creating a new release

Creating a release is a two-step process:

1. **Prepare locally:**
   ```bash
   pnpm release:prepare        # Bumps version (patch by default) and updates CHANGELOG.md
   # Or for bigger updates:
   # pnpm release:prepare minor
   # pnpm release:prepare major
   ```
2. **Verify and tag:**
   ```bash
   pnpm preflight              # Run tests, linter, and type checks
   git add .
   git commit -m "chore(repo): release v0.1.1"
   git tag v0.1.1
   git push && git push origin v0.1.1
   ```

When you push a version tag (`v*`), our automated GitHub Action (`.github/workflows/release.yml`):
- Verifies the tag matches the repository version.
- Compiles the Next.js web application and packages the Electron desktop app.
- Creates a clean GitHub Release with changelog notes filtered to user-facing changes (features, fixes, performance improvements, and visual updates).
- Cleans up older binary files to keep storage tidy, while keeping past release notes and tags intact.

---

## Running from source

If you want to modify the code or contribute to the project, you can run everything from source.

### Prerequisites

```bash
node --version   # Version 22 or newer
corepack enable  # Enables pnpm package manager
brew install uv  # Installs uv for Python 3.14 environment
brew install ollama
```

### Install dependencies and start

```bash
pnpm install
pnpm dev
```

This starts both parts of the system at the same time:
- **Web interface:** <http://localhost:3000>
- **Rules engine API & documentation:** <http://localhost:8000/docs>

The browser communicates with the Python search engine securely through the local interface. Nothing is accessible from your outside local network.

### Running the desktop app locally

To run the desktop Electron shell against your local code:

```bash
pnpm --filter web build          # Builds production web assets
pnpm --filter desktop build      # Compiles desktop shell
pnpm --filter desktop dev        # Launches the app window
```

To build an unsigned `.dmg` / `.zip` on your machine:

```bash
pnpm release:package
```

### Adding a rulebook PDF (Stage 2)

Install the PDF tools once:

```bash
cd services/rag-engine
uv sync --extra ingest
```

Then, with `pnpm dev` running, open **Rulebooks** in the app (`/pl/rulebooks` or `/en/rulebooks`), type a game id such as `azul`, and drop your PDF. The file is copied into local storage and split into pages on this computer. You can do the same in the desktop app — it uses the same upload.

The terminal command still works if you prefer it:

```bash
uv run python -m rag_engine.ingest add \
  --game azul --kind rulebook --title Azul \
  /path/to/your-rulebook.pdf
```

What this does:

- Splits the PDF into text sections and page images under `storage/` (or `BGA_STORAGE_DIR` in the desktop app — the same folder the engine already uses).
- Updates `games.json` so the game appears in the list.
- Optional `--fetch-community-faq` loads **text** from BoardGameGeek’s official XML API only (never Files / HTML scraping). If the network is down, the PDF import still succeeds.

**Important:** after ingest, Ask still answers from the model’s general knowledge. Citing your rulebook pages is Stage 3. You can confirm the material is ready with `GET /games` (non-zero `chunkCount`) and by checking `storage/assets/<gameId>/pNN.png`. A live percent bar while a PDF is imported is Stage 3A (after retrieval).

For a YouTube teaching video (captions preferred; Whisper only if you also installed `--extra speech`):

```bash
uv run python -m rag_engine.ingest add \
  --game azul --kind video_transcript \
  'https://www.youtube.com/watch?v=…'
```

Manual check (Z5): try one simple and one complex game from **your own** PDFs — titles are not hardcoded in the repo.

---

## Everyday commands

| Command | What it does in plain language |
| --- | --- |
| `pnpm dev` | Starts both the web interface and the Python engine for everyday use. |
| `pnpm preflight` | Fast sanity check: runs linter, TypeScript types, and tests. |
| `pnpm verify` | Full verification: checks types, tests, code style, and builds production assets. |
| `pnpm test` | Runs all automated unit tests across the whole project. |
| `pnpm typecheck` | Validates TypeScript and Python type safety (`mypy --strict`). |
| `pnpm check:fix` | Automatically formats files and fixes safe code issues. |
| `pnpm release:prepare` | Updates version numbers across all packages and prepares the changelog. |
| `pnpm release:package` | Builds the standalone web app and packages the desktop installer locally. |

---

## Project structure

The repository is organized into distinct, focused parts:

```text
bga/
├── apps/
│   ├── web/               Web interface (Next.js 16, React 19, Mantine 9)
│   └── desktop/           Desktop application shell (Electron)
├── services/
│   └── rag-engine/        Python engine (FastAPI, rulebook search, local models)
│       ├── rag_engine/    Search logic and API endpoints
│       └── storage/       Local folder where your rulebook files are stored (never uploaded)
├── packages/
│   └── api-contract/      Shared communication types between frontend and backend
├── scripts/               Release and setup helper scripts
└── docs/                  Architecture documentation and roadmap
```

---

## Languages

The assistant supports both **English** and **Polish**.

Every user-facing label, button, and message is defined in language translation files (`apps/web/src/i18n/locales/`). You can switch the language anytime in the interface, and the URL will update accordingly (`/en` or `/pl`).

---

## Current status

### What is working today

- Complete local monorepo setup (TypeScript frontend + Python search engine).
- Live streaming connection from the Python engine to the web interface.
- **Local model answers** — the engine connects to Ollama and streams a real answer token by token. The model answers from general knowledge for now; it does not cite your rulebooks yet (that is Stage 3).
- **Honest health check** — `/health` tells you exactly which models are installed and which are missing, instead of just saying "Ollama is running".
- **One question at a time** — the engine makes sure only one answer is being generated at any moment, so your computer is not overloaded. A second question waits in line. If you cancel a question, the slot opens immediately.
- **Rulebook PDF import** — CLI and desktop drop zone turn your own PDFs into page images and text fragments on disk, and register the game in `games.json`. Optional BoardGameGeek description text via the official XML API only.
- Complete English and Polish translations.
- Automated desktop packaging (macOS arm64 DMG and ZIP).
- Automated GitHub Release pipeline with changelog generation.
- Strict tests ensuring the engine never invents document citations.

### What is being added next

- Hybrid keyword + vector search through rules (answers that cite your pages).
- Local voice recognition (Whisper) and speech synthesis (Piper).

For details on the technical roadmap and milestones, see [`docs/ROADMAP.md`](docs/ROADMAP.md).
For architectural decisions, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Source material and privacy

You supply the rulebook PDFs yourself from publisher websites or personal scans. The software comes with no bundled rulebooks, and your game library never leaves your computer.
