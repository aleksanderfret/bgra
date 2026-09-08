---
name: frontend-code
description: Frontend coding rules for the Next.js / React / Mantine app in apps/web. Use when writing or reviewing TS, TSX, JSX, React components, Next.js pages, hooks, or i18n UI. Nested ternaries in JSX are forbidden; `any` is forbidden; event callbacks must be named before return; no inline object types — named interfaces; components are arrow functions typed with FC<Props>.
paths: apps/web/**/*.{ts,tsx}
---

# Frontend code

Rules for `apps/web`. Mechanical bans (`any`, nested ternaries) are also
enforced by Biome — do not disable them.

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

**No inline callbacks in JSX.** Define event handlers and other function props
as named consts in the component body, before `return`. Pass the name in JSX.
Applies to `onClick`, `onChange`, `onSubmit`, and any other function prop —
including short one-liners.

```tsx
// Forbidden
<Button onClick={() => setBusy(true)}>…</Button>
<Button onClick={() => { void api.save(); }}>…</Button>

// Required
const handleStart = () => {
  setBusy(true);
};
const handleSave = () => {
  void api.save();
};

return (
  <>
    <Button onClick={handleStart}>…</Button>
    <Button onClick={handleSave}>…</Button>
  </>
);
```

Name handlers after what they do (`handleContinue`, `handleSaveDiagnostics`),
not after the DOM event alone. Do not wrap a named handler in another arrow
in JSX (`onClick={() => handleSave()}` is still inline — use `onClick={handleSave}`).

**No inline object types.** Do not put `{ … }` object shapes in a parameter
list, return annotation, or generic slot. Declare a named type and use it —
for component props, helper parameters, and any other object-shaped argument.

```tsx
// Forbidden
export function DesktopGate({ locale, children }: { locale: string; children: React.ReactNode }) {
  …
}

function formatBytes(opts: { value: number; unit: string }): string {
  …
}

// Required
interface DesktopGateProps {
  locale: string;
  children: React.ReactNode;
}

interface FormatBytesOptions {
  value: number;
  unit: string;
}

function formatBytes(opts: FormatBytesOptions): string {
  …
}
```

**Prefer `interface` over `type`.** Use `interface` for object shapes
(props, options, records) whenever it works. Reach for `type` only when
`interface` cannot express it — unions, intersections of primitives, mapped
or conditional types, tuple aliases.

**Components are arrow functions typed with `FC`.** Wherever a React
component is possible, define it as `const Name: FC<NameProps> = (…) => …`,
not `export function Name(…)`. Import `FC` from `react`. Name the props
interface `NameProps`.

```tsx
// Forbidden
export function DesktopGate({ locale, children }: { locale: string; children: React.ReactNode }) {
  …
}

export function AnswerPanel({ state }: AnswerPanelProps) {
  …
}

// Required
interface DesktopGateProps {
  locale: string;
  children: React.ReactNode;
}

export const DesktopGate: FC<DesktopGateProps> = ({ locale, children }) => {
  …
};

interface AnswerPanelProps {
  state: AnswerState;
}

export const AnswerPanel: FC<AnswerPanelProps> = ({ state }) => {
  …
};
```

`FC` does not imply `children` — put `children` on the props interface when
the component accepts them. Next.js special files that must stay default
export functions (`page.tsx`, `layout.tsx`, `route.ts` handlers) are the
exception; still use a named props interface there, never an inline object.

## Structure

- **Early returns** for error and empty states. Do not nest the happy path
  inside an `else`.
- **`'use client'`** only when the file needs state, effects, or browser
  events. Pages and layouts stay server components when they can.
- **Mantine** for UI. No Tailwind, no extra CSS-in-JS library. Style with
  component props and Mantine CSS variables.
- **Copy:** no hardcoded user-facing text. Follow
  `.cursor/skills/translations/SKILL.md`. Every string on screen comes from
  both locale files; the engine sends codes, not prose.
- **Locale lives in the URL.** Do not call `i18n.changeLanguage` to switch
  language; navigate with `withLocale` (see `LanguageSwitcher`).
- **Do not lie to the type checker.** No non-null assertions (`!`) on values
  that can be missing. `tsconfig` has `strict` and `noUncheckedIndexedAccess`.
- **Keys** are stable ids from the data, not array indexes, when the item has
  an id.
- **Accessibility:** errors use `role="alert"`; icon-only controls get
  `aria-label` from `t()`.
- **Players, not programmers.** The people who open the app are board-game
  players. Status, recovery, and setup stay in the UI. Follow
  `.cursor/rules/player-first.mdc`.

## Data and tests

- Fetch through the Next.js proxy (`/api/engine/...`), never from the browser
  to the Python port.
- Render tests with `src/test-utils/render.tsx` (Mantine + i18n). Pass
  `locale` when the assertion is language-specific.
- UI tests follow `.cursor/skills/ui-testing/SKILL.md`: query and click the
  way a user would (`getByRole`, labels, text). No `querySelector`, no test ids.
- Import `describe`, `it`, `expect` from `vitest`. `globals` are off.
- Put branching UI logic in a pure module (`answer-state.ts`) and unit-test
  that; keep the component thin.

## Checklist before finishing a UI change

- [ ] No nested ternary in JSX
- [ ] No `any`
- [ ] No inline callbacks in JSX (handlers named before `return`)
- [ ] No inline object types; props/params use a named `interface` (prefer over `type`)
- [ ] Components are `const Name: FC<NameProps> = …` (except Next.js page/layout/route)
- [ ] New copy exists in both locale files
- [ ] Happy path is not buried in nested `if`/`else`
- [ ] UI tests query by role / label / text (see `ui-testing`)
- [ ] `pnpm --filter web test` (or `pnpm verify`) covers the new branch
