# App nav, Settings, and Init — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four-item top menu with stable URLs; language/theme only on Settings; Init hard-gated and not in the menu; land on Add game when ready.

**Architecture:** Rename Next route segments and page chrome; keep page packages (`home`/`teach`/`rulebooks`/`setup`) as content hosts where renaming folders adds little value; AppNav + DesktopGate + desktop `gate.ts` become the source of path truth. Old paths redirect via thin Next route files.

**Tech Stack:** Next.js App Router, `@bga/pages` / `@bga/components`, Mantine, Electron gate, i18n catalogues.

## Global Constraints

- No hardcoded user-facing strings — `en` + `pl` `common.json` in the same change.
- Player-first: menu labels plain language.
- Hard gate allows `/init`, `/settings`, `/uninstall` only until ready.
- Do not auto-commit unless the user asks.

## File map

| Area | Files |
| --- | --- |
| Nav | `packages/components/src/app-nav/AppNav.tsx` (+ test) |
| Settings page | `packages/pages/src/settings/*`, `apps/web/src/app/[locale]/settings/page.tsx` |
| New routes | `learn/`, `check-rule/`, `add-game/`, `init/` under `apps/web/src/app/[locale]/` |
| Redirects | keep old `teach/`, `rulebooks/`, `setup/`, and locale `page.tsx` as redirects |
| Page chrome | `HomePage`, `TeachPage`, `RulebooksPage`, `SetupPage` — strip switchers; Init link to Settings |
| Gate | `DesktopGate`, `AssistantReadyGate`, `apps/desktop/src/setup/gate.ts` (+ tests), `main.ts` |
| i18n | `en/common.json`, `pl/common.json` |

### Task 1: i18n + AppNav paths

- [ ] Update `appNav` keys: `learn`, `checkRule`, `addGame`, `settings` (replace teach/questions/rulebooks).
- [ ] Add `settings.title`, `settings.subtitle`, `settings.open` (Init link), `settings.navLabel` if needed.
- [ ] Rewrite `AppNav` views → `learn` \| `check-rule` \| `add-game` \| `settings` with matching paths.
- [ ] Fix `AppNav.test.tsx`.

### Task 2: Settings page + strip switchers from other pages

- [ ] Create `SettingsPage` with Language + ColorScheme only + AppNav.
- [ ] Wire `apps/web/.../settings/page.tsx`.
- [ ] Remove switchers from Home/Teach/Rulebooks; keep Diagnostics/Uninstall on Check rule + Learn.
- [ ] Setup/Init: Settings link + Uninstall; no switchers.

### Task 3: Next routes + redirects

- [ ] Add `learn`, `check-rule`, `add-game`, `init` pages (adapters to existing page packages).
- [ ] Locale root + old `teach`/`rulebooks`/`setup` → `redirect()` to new paths.
- [ ] Default post-gate target `/add-game`.

### Task 4: Desktop + client gates

- [ ] `initialAppPath`: passed → `/add-game`; failed → `/init`.
- [ ] `isGatedAllowedPath`: `/init`, `/settings`, `/uninstall`.
- [ ] `DesktopGate` / `AssistantReadyGate` / `main.ts` use `/init` and `/add-game`.
- [ ] Update gate tests.

### Task 5: Verify

- [ ] `pnpm preflight` (or targeted tests + typecheck + biome) on touched packages.
