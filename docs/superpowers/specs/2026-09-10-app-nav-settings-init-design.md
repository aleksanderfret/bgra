# Design: App nav routes, Settings, and Init

Date: 2026-09-10  
Status: approved for planning

## Goal

Give players a clear top menu and stable URLs. Put language and color scheme on a dedicated Settings page so they no longer appear on every screen. Keep first-run download/setup on a separate Init route that is not in the menu.

## Routes

All app routes stay under `/[locale]/…`.

| Menu label (en) | Path | Replaces |
| --- | --- | --- |
| Learn | `/learn` | `/teach` |
| Check rule | `/check-rule` | `/` (questions home) |
| Add game | `/add-game` | `/rulebooks` |
| Settings | `/settings` | *(new)* |
| — (not in menu) | `/init` | `/setup` |

After Init succeeds, the default landing path is `/add-game`.

Old paths redirect to the new ones (same locale, same query when present) so bookmarks and in-flight desktop loads do not break:

- `/teach` → `/learn`
- `/` (locale root used as questions) → `/check-rule`
- `/rulebooks` → `/add-game`
- `/setup` → `/init`

Uninstall stays at `/uninstall` (out of scope for rename).

## Top menu

On Learn, Check rule, Add game, and Settings:

- One shared nav control with exactly four items: Learn, Check rule, Add game, Settings.
- Init is never listed.
- Diagnostics and uninstall entry points stay as separate controls (not menu items), on the same pages where they appear today (home/teach equivalents → Check rule / Learn).

On Init:

- No main menu (player is finishing install).
- A way to open Settings (link/button) so language and theme can be changed during the hard gate.
- Uninstall entry stays available as today.

## Settings page

- Hosts only: interface language (`LanguageSwitcher`) and color scheme (`ColorSchemeSwitcher`).
- Remove those two controls from Learn, Check rule, Add game, and Init chrome.
- Reuse existing `language.*` and `colorScheme.*` copy; add Settings page strings (`settings.title`, nav labels, etc.) in `en` and `pl`.

## Init and the hard gate

Behavior matches today’s setup gate, with renamed paths:

- While setup is incomplete (first install, or downloads/models still missing), the app hard-holds the player on Init: Electron navigation lock and client `DesktopGate` only allow `/init`, `/settings`, and `/uninstall` (under the active locale).
- There is no menu link to Init. Opening `/init` by typing the URL in the web build is allowed and needs no extra protection.
- When the gate passes, open `/add-game` (not the old locale root).

## Package / file shape (implementation sketch)

Follow existing frontend-package layout:

- Update `AppNav` (or replace it) for the four new targets and labels.
- Add `packages/pages/src/settings/` + `apps/web/src/app/[locale]/settings/page.tsx`.
- Rename route folders / adapters: `teach` → `learn`, root questions → `check-rule`, `rulebooks` → `add-game`, `setup` → `init`, with thin redirects from old paths.
- Update desktop `initialAppPath`, `isGatedAllowedPath`, splash/wait URLs, and tests that hard-code `/setup`, `/teach`, `/rulebooks`, or locale root as the questions home.
- Update i18n keys for nav labels; keep player-facing wording plain (board-game player, not developer).

## Out of scope

- Shared layout shell refactor beyond what nav/chrome duplication already requires.
- New settings beyond language and color scheme.
- Renaming or redesigning uninstall / diagnostics flows.
- Changing how models are downloaded or how readiness is probed (only path and chrome changes).

## Success criteria

- Language and theme appear only on Settings (plus a Settings entry from Init during the gate).
- Top menu shows Learn, Check rule, Add game, Settings on the main app pages.
- Init is reachable by gate / direct URL only, hard-holds until ready, then lands on Add game.
- Old URLs redirect to the new ones.
- `en` + `pl` catalogues stay in sync; desktop gate tests cover `/init` + `/settings`.
