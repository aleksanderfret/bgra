---
name: frontend-code
description: Frontend coding rules for the Next.js / React / Mantine app in apps/web. Use when writing or reviewing TS, TSX, JSX, React components, Next.js pages, hooks, or i18n UI. Nested ternaries in JSX are forbidden; `any` is forbidden.
paths: apps/web/**/*.{ts,tsx}
---

# Frontend code

Rules for `apps/web`. They match how the existing UI is written. Mechanical
bans (`any`, nested ternaries) are also enforced by Biome — do not disable them.

## Hard bans

**No nested ternaries in JSX.** One ternary is already a smell; a ternary
inside a ternary is not allowed. Extract a variable, use early `return`, or
split a small component.

```tsx
// Forbidden
{loading ? <Spinner /> : items.length === 0 ? <Empty /> : <List items={items} />}

// Required
if (loading) {
  return <Spinner />;
}
if (items.length === 0) {
  return <Empty />;
}
return <List items={items} />;
```

In JSX, prefer `{condition && <Thing />}` or a named boolean (`canAsk`) over a
chain of `? :`. See `AnswerPanel` and `RulesChat`.

**`any` is forbidden.** No `any`, no `as any`, no `// @ts-expect-error` to hide
it, no `eslint-disable` / biome ignore for `noExplicitAny`. Narrow with a type
guard (`isLocale`, `isAnswerMode`) or a typed assertion that names the real
type (`as GameSummary[]` only at a trusted JSON boundary after a check).

## Structure

- **Early returns** for error and empty states. Do not nest the happy path
  inside an `else`.
- **`'use client'`** only when the file needs state, effects, or browser
  events. Pages and layouts stay server components when they can.
- **Exported props** are a named interface (`AnswerPanelProps`), not an inline
  object in the function signature.
- **Mantine** for UI. No Tailwind, no extra CSS-in-JS library. Style with
  component props and Mantine CSS variables.
- **No user-facing string in code.** Every word on screen comes from
  `apps/web/src/i18n/locales/<locale>/common.json`, both `pl` and `en`. Add a
  key to both files in the same change. Engine `code`s stay codes; the UI
  translates them.
- **Locale lives in the URL.** Do not call `i18n.changeLanguage` to switch
  language; navigate with `withLocale` (see `LanguageSwitcher`).
- **Do not lie to the type checker.** No non-null assertions (`!`) on values
  that can be missing. `tsconfig` has `strict` and `noUncheckedIndexedAccess`.
- **Keys** are stable ids from the data, not array indexes, when the item has
  an id.
- **Accessibility:** errors use `role="alert"`; icon-only controls get
  `aria-label` from `t()`.

## Data and tests

- Fetch through the Next.js proxy (`/api/engine/...`), never from the browser
  to the Python port.
- Render tests with `src/test-utils/render.tsx` (Mantine + i18n). Pass
  `locale` when the assertion is language-specific.
- Import `describe`, `it`, `expect` from `vitest`. `globals` are off.
- Put branching UI logic in a pure module (`answer-state.ts`) and unit-test
  that; keep the component thin.

## Checklist before finishing a UI change

- [ ] No nested ternary in JSX
- [ ] No `any`
- [ ] New copy exists in both locale files
- [ ] Happy path is not buried in nested `if`/`else`
- [ ] `pnpm --filter web test` (or `pnpm verify`) covers the new branch
