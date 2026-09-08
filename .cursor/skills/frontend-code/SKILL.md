---
name: frontend-code
description: Frontend coding rules for the Next.js / React / Mantine app in apps/web. Use when writing or reviewing TS, TSX, JSX, React components, Next.js pages, hooks, or i18n UI. Nested ternaries in JSX are forbidden; `any` is forbidden; no `as Type` narrowing — use type guards; event callbacks must be named before return; no inline object types — named interfaces; prefer arrow functions; components are FC<Props> arrows.
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
guard (`isLocale`, `isAnswerMode`).

**No type casts for narrowing.** Do not write `value as SomeType` (or
`payload as EngineErrorBody`) to silence the checker. Build a type guard
(`value is SomeType`) and use it. Applies to JSON from `fetch`, unknown
payloads, and mock call args.

```tsx
// Forbidden
const body = payload as EngineErrorBody;
const games = (await response.json()) as GameSummary[];

// Required
const isEngineErrorEvent = (value: unknown): value is EngineErrorEvent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return (
    'type' in value &&
    value.type === 'error' &&
    'code' in value &&
    typeof value.code === 'string'
  );
};

const payload: unknown = await response.json();
if (isGameSummaryList(payload)) {
  setGames(payload);
}
```

`as const` (const assertions on literals) is fine — that is not narrowing
`unknown`. Prefer `'key' in value` / `typeof` over casting to a scratch
interface just to read a field.

**No deprecated React types or APIs.** Prefer the current `@types/react` names.
In particular `FormEvent` / `FormEventHandler` are deprecated — they do not
exist in the DOM. Use the real event for the handler:

| Handler | Use |
| --- | --- |
| `onSubmit` | `SubmitEvent<HTMLFormElement>` |
| `onChange` (inputs) | `ChangeEvent<…>` |
| `onInput` | `InputEvent<…>` |
| generic bubble | `SyntheticEvent<…>` |

Do not use deprecated event fields (`keyCode`, `which`, `charCode`) or
`onKeyPress` — use `key` / `code` and `onKeyDown` / `onKeyUp`.

**Prefer arrow functions.** Helpers, handlers, hooks, type guards, and module
exports use `const name = (…) => …` (or `async (…) => …`), not
`function name(…)`. Same for nested helpers inside components and tests.

```tsx
// Forbidden
function runtimeErrorMessage(t: Translate, code: string): string {
  …
}
export function isLocale(value: string): value is Locale {
  …
}
const handleSave = function () {
  …
};

// Required
const runtimeErrorMessage = (t: Translate, code: string): string => {
  …
};
export const isLocale = (value: string): value is Locale => …
const handleSave = (): void => {
  …
};
```

**No inline callbacks in JSX.** Define event handlers and other function props
as named consts in the component body, before `return`. Pass the name in JSX.
Applies to `onClick`, `onChange`, `onSubmit`, and any other function prop —
including short one-liners. Those named handlers are arrow functions (see
above).

```tsx
// Forbidden
<Button onClick={() => setBusy(true)}>…</Button>
<Button onClick={() => { void api.save(); }}>…</Button>

// Required
const handleStart = (): void => {
  setBusy(true);
};
const handleSave = (): void => {
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

const formatBytes = (opts: { value: number; unit: string }): string => {
  …
};

// Required
interface DesktopGateProps {
  locale: string;
  children: React.ReactNode;
}

interface FormatBytesOptions {
  value: number;
  unit: string;
}

const formatBytes = (opts: FormatBytesOptions): string => {
  …
};
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
export functions (`page.tsx`, `layout.tsx`) or HTTP method exports
(`route.ts` `GET` / `POST` / …) are the exception; still use a named props
interface there, never an inline object. Helpers inside those files still use
arrows.

**Package layout.** Reusable UI, hooks, utils, and full-page compositions
belong in `@bga/components`, `@bga/hooks`, `@bga/utils`, and `@bga/pages`.
Follow `.cursor/skills/frontend-packages/SKILL.md`: one unit per folder, local
`index` only, no package barrels, no `export *` / `import *`, named exports
only (Next route files may default-export a named page).

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
- [ ] No `as Type` narrowing — use `value is T` guards
- [ ] No deprecated React types (`FormEvent` → `SubmitEvent`, etc.)
- [ ] No inline callbacks in JSX (handlers named before `return`)
- [ ] Functions and handlers use arrows (`const fn = (…) =>`), not `function`
- [ ] No inline object types; props/params use a named `interface` (prefer over `type`)
- [ ] Components are `const Name: FC<NameProps> = …` (except Next.js page/layout/route)
- [ ] New copy exists in both locale files
- [ ] Happy path is not buried in nested `if`/`else`
- [ ] UI tests query by role / label / text (see `ui-testing`)
- [ ] `pnpm --filter web test` (or `pnpm verify`) covers the new branch
