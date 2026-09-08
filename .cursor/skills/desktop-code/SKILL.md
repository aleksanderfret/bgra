---
name: desktop-code
description: >-
  Electron desktop shell layout and conventions for apps/desktop. Use when
  editing main process, preload, IPC, runtime (Ollama/processes), setup gate,
  splash, or organizing files under apps/desktop/src.
paths: apps/desktop/**/*.{ts,tsx,js,mjs}
---

# Desktop (Electron) code

The desktop app is the **main process + preload** shell. The player UI is the
Next.js web app; desktop starts it, the engine, and exposes a small bridge.

Also follow player-first and no hardcoded player-facing strings in any UI the
shell shows (splash copy comes from the same i18n mindset / dedicated copy
helpers — not ad-hoc English in random files).

## Current problem

`apps/desktop/src` is a **flat** folder: entry, IPC, runtime, and helpers all
sit side by side (`main.ts`, `processes.ts`, `ollama_runtime.ts`, …). That
makes “what is the app entry” vs “what is a helper” hard to see. Prefer the
layout below for new work and when touching a file enough to move it.

## Target layout

```
apps/desktop/src/
  main/
    main.ts                 # app lifecycle, windows — entry (package "main")
    windows.ts              # BrowserWindow / splash window helpers (optional split)
  preload/
    preload.ts              # contextBridge only — minimal surface
  ipc/
    desktop-api.ts          # shared types for the bridge (or import from a tiny shared module)
    handlers.ts             # ipcMain.handle / on registration
  runtime/
    processes.ts            # spawn/stop Next + engine
    binaries.ts             # resolve bundled / system binaries
    ollama_runtime.ts       # install / wait / pull
    ports.ts
  system/
    machine.ts
    capabilities.ts
    mac_hidden_app.ts
  setup/
    gate.ts                 # first-run / ask-ready gate
    splash.ts
    diagnostics.ts
```

Co-locate `*.test.ts` next to the module they cover (same folder).

| Folder | Role |
| --- | --- |
| `main/` | Process entry, window lifecycle, quit/cleanup |
| `preload/` | `contextBridge` — no Node for the renderer beyond the allowlisted API |
| `ipc/` | Bridge types + `ipcMain` handlers |
| `runtime/` | Child processes, ports, Ollama, binary paths |
| `system/` | Host facts (RAM, GPU, platform quirks) |
| `setup/` | First-run gate, splash, diagnostics export |

## Rules

- **Named exports** for modules. The compiled Electron entry may remain whatever
  `package.json` `"main"` points at; do not sprinkle `export default` for
  helpers.
- **No `export * from` / `import * from`.** Import concrete symbols.
- **Preload stays tiny.** Types for the bridge can be shared; logic stays in
  main/`ipc` + `runtime`.
- **One concern per file.** If `main.ts` grows past orchestration, move window
  or IPC wiring into `main/windows.ts` / `ipc/handlers.ts`.
- Tests stay next to the pure logic (`gate.test.ts`, `ports.test.ts`, …) —
  do not invent a separate `__tests__` tree unless a folder becomes crowded.

## What not to put here

- React screens and Mantine UI → `@bga/pages` / `@bga/components` (web).
- Engine / retrieval logic → `services/rag-engine`.

## Checklist

- [ ] New file landed in `main` / `preload` / `ipc` / `runtime` / `system` / `setup`
- [ ] Entry vs helper is obvious from the path
- [ ] No star re-exports; named imports only
- [ ] Preload surface unchanged unless the player-facing bridge genuinely needs it
- [ ] Tests beside the module they cover
