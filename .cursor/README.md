# Agent harness

Project-scoped Cursor config. Commit everything in this directory except
local secrets. Personal skills stay in `~/.cursor/skills/` and do not belong
here.

| Path | Role |
| --- | --- |
| `skills/` | Project skills (`SKILL.md` per skill). Shared with anyone who clones the repo. |
| `skills/premortem/` | Pre-mortem before implementation: tigers, paper tigers, elephants. |
| `skills/code-comments/` | Comments only for non-intuitive / non-standard / exceptionally complex code. |
| `skills/frontend-code/` | How to write `apps/web` (no nested JSX ternaries, no `any`, i18n, Mantine). |
| `skills/translations/` | No hardcoded UI copy; every string lives in `en`/`pl` catalogues. |
| `skills/ui-testing/` | Testing Library: query UI as a user (roles, labels, text). |
| `rules/` | Cursor rules (`.mdc`). Persistent guidance, always-on or glob-scoped. |
| `commands/` | Slash commands for repeatable agent workflows. |

Always-on working agreements for every coding agent live in [`AGENTS.md`](../AGENTS.md)
at the repo root — Cursor, Copilot, and other tools all read that file. Do not
duplicate it here.

## Adding a skill

1. Create `.cursor/skills/<skill-name>/SKILL.md`.
2. Use a lowercase, hyphenated `name` and a third-person `description` that
   states both what the skill does and when to apply it.
3. Keep `SKILL.md` short. Put long reference material in sibling files and
   link them from the skill.

## Adding a rule

1. Create `.cursor/rules/<topic>.mdc` with YAML frontmatter.
2. Set `alwaysApply: true` only for constraints that must hold in every chat.
3. Otherwise set `globs` (for example `**/*.py`) so the rule loads with matching files.
