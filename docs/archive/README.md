# Plan archive

English-only copies of the plans used to build this app. Cursor kept the working
files in `~/.cursor/plans/` (outside git). This folder is the in-repo record.

The **living** documents stay beside this folder (`docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`). Edit those when the product changes. Files here are
historical: what we planned, not a second source of truth.

Stage numbers follow **implementation order**. A letter means the work sat
between two numbered roadmap stages (0a after 0 and before 1; 2a after 2 and
before 3). Multi-document expansions were originally labelled 2B; they are 2A
here because nothing was built between Stage 2 and that work.

| File | Stage | Outcome |
| --- | --- | --- |
| [stage-0-architecture-and-plan-audit.md](stage-0-architecture-and-plan-audit.md) | 0 — original plan, audit, and locked decisions | Living copy is `docs/ARCHITECTURE.md` |
| [stage-0-execution-roadmap.md](stage-0-execution-roadmap.md) | 0 — stage list and acceptance criteria | Living copy is `docs/ROADMAP.md` |
| [stage-0a-security-and-performance-hardening.md](stage-0a-security-and-performance-hardening.md) | 0A — local-first proxy, bindings, headers | Implemented |
| [stage-0b-electron-desktop-shell.md](stage-0b-electron-desktop-shell.md) | 0B — desktop window next to the web app | Implemented |
| [stage-0c-desktop-release-pipeline.md](stage-0c-desktop-release-pipeline.md) | 0C — macOS DMG/zip release on a version tag | Implemented |
| [stage-1-local-models.md](stage-1-local-models.md) | 1 — local chat model, honest `/health` | Implemented |
| [stage-2-document-ingestion.md](stage-2-document-ingestion.md) | 2 — PDF and transcripts → chunks and page pictures | Implemented |
| [stage-2a-multi-doc-expansions.md](stage-2a-multi-doc-expansions.md) | 2A — several PDFs per game; expansions as linked games | Implemented |
| [stage-3-retrieval.md](stage-3-retrieval.md) | 3 — answers from the documents, with a page citation | Implemented |
| [stage-3a-ingest-progress.md](stage-3a-ingest-progress.md) | 3A — PDF percent bar (original scope) | Superseded by [stage-3a-activity-progress.md](stage-3a-activity-progress.md) |
| [stage-3a-activity-progress.md](stage-3a-activity-progress.md) | 3A — reusable activity view, boot handoff, honest PDF percent | Implemented |
| [stage-3e-adaptive-thinking.md](stage-3e-adaptive-thinking.md) | 3E — think only when hits conflict or barely clear the cutoff | Implemented |
| [stage-3f-search-unavailable.md](stage-3f-search-unavailable.md) | 3F — honest banner when search never started | Implemented |
| [stage-3c-search-catch-up.md](stage-3c-search-catch-up.md) | 3C — rebuild search for an existing library on start | Implemented |
| [stage-3b-first-run-install-gate.md](stage-3b-first-run-install-gate.md) | 3B — first-run Ollama + models wall on packaged desktop | Implemented (smoke Mac + Windows before release) |
| [stage-3g-rulebook-import-understanding.md](stage-3g-rulebook-import-understanding.md) | 3G — section coverage (list questions) and a gated page-layout reader | Implemented |
| [stage-3d-conversation-thread.md](stage-3d-conversation-thread.md) | 3D — scrollable per-game thread | Implemented |

Stage 3B (first-run install gate) plan:
[`stage-3b-first-run-install-gate.md`](stage-3b-first-run-install-gate.md).

## Not included

- npm → pnpm migration drafts found in the same Cursor plans folder. This repo
  started on pnpm; those drafts belong to another project.
- Chat transcripts. Only the written plans.

Decision numbers in some early plans (especially 0A) were later renumbered in
`docs/ARCHITECTURE.md`. Trust the living architecture file for the current D/Z
labels.
