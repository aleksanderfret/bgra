---
name: code-comments
description: Use when writing, editing, or reviewing comments, JSDoc, or Python docstrings in this repo — including new code, refactors, and drive-by documentation.
---

# Code comments

Add comments in code ONLY when something is non-intuitive/non-standard and/or exceptionally complex, the way humans would.

The code already names the what. A comment is for the trap a competent reader would miss — a constraint, a surprising default, a reason the obvious approach is wrong.

## Keep

A constraint the syntax cannot show, or a choice that looks like a mistake:

```ts
// i18next treats `_` as the plural marker, so `player_aid` would mean "plural of player".
pluralSeparator: '--',
```

```py
# Silently returning [] here would look like "no games ingested yet".
raise HTTPException(...)
```

## Drop

Restating the name, the type, or the next line. Essays that belong in `docs/ARCHITECTURE.md`. JSDoc / module docstrings on every export.

```ts
/** Hands the active locale to every client component below it. */
/** One increment of the answer text. */
// Return the list of games, newest first.
```

If deleting the comment does not change what a reader would do, delete it.

## Red flags

- Commenting a field whose name already says it (`excerpt`, `indexedAt`, `approx_disk_gb`)
- A function docstring that repeats the function name
- "How this works" above a 10-line function
- Documenting an invariant that is already enforced by a type, a test name, or `docs/ARCHITECTURE.md` — unless the call site would still get it wrong
