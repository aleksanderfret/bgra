---
name: frontend-packages
description: >-
  Monorepo layout for FE shared code under packages/components, packages/pages,
  packages/hooks, and packages/utils. Use when adding or moving React components,
  page UI, hooks, helpers, or when structuring apps/web imports from @bga/* packages.
paths: packages/{components,pages,hooks,utils}/**/*.{ts,tsx};apps/web/**/*.{ts,tsx}
---

# Frontend packages

Shared UI and helpers live in workspace packages, not under `apps/web/src/features`.
`apps/web` keeps Next.js route files, i18n catalogues, theme, and thin adapters.

Package names: `@bga/components`, `@bga/pages`, `@bga/hooks`, `@bga/utils`.

Also follow `.cursor/skills/frontend-code/SKILL.md`, translations, and ui-testing.

## Packages

| Package | What goes here | Tests |
| --- | --- | --- |
| `@bga/components` | All reusable UI components | Required — each unit has tests |
| `@bga/hooks` | Reusable React hooks | Required — each unit has tests |
| `@bga/utils` | Reusable helper functions (pure / non-React) | Required — each unit has tests |
| `@bga/pages` | Full-page JSX compositions | None — pages are wired in `apps/web` |

## One unit per folder

Every component, hook, util, and page is its **own folder**. That folder owns
its implementation, its local `index.ts`, and (except pages) its tests.

```
packages/components/src/pdf-drop-zone/
  PdfDropZone.tsx
  PdfDropZone.test.tsx
  index.ts

packages/hooks/src/use-ask-stream/
  useAskStream.ts
  useAskStream.test.ts
  index.ts

packages/utils/src/game-summary/
  game-summary.ts
  game-summary.test.ts
  index.ts

packages/pages/src/rulebooks/
  RulebooksPage.tsx
  index.ts
```

Folder `index.ts` re-exports **only that unit’s named exports** — never the
whole package.

```ts
// packages/components/src/pdf-drop-zone/index.ts
export { PdfDropZone } from './PdfDropZone';
export type { PdfDropZoneProps } from './PdfDropZone';
```

## No package-wide barrels

- Do **not** add `packages/*/src/index.ts` (or any file) that re-exports every
  unit in the package.
- Do **not** use `export * from '…'` or `import * from '…'` anywhere.
- Import a concrete subpath:

```ts
// Required
import { PdfDropZone } from '@bga/components/pdf-drop-zone';
import { useAskStream } from '@bga/hooks/use-ask-stream';
import { isGameSummaryList } from '@bga/utils/game-summary';
import { RulebooksPage } from '@bga/pages/rulebooks';

// Forbidden
import { PdfDropZone } from '@bga/components';
import * as Components from '@bga/components/pdf-drop-zone';
export * from './PdfDropZone';
```

Wire package.json with subpath exports (one entry pattern per unit), e.g.
`"./pdf-drop-zone": "./src/pdf-drop-zone/index.ts"` or an equivalent
`"./*"` map that resolves to `./src/*/index.ts` — still **no** root `"."`
barrel that dumps the whole package.

## Named exports only

- **Never** `export default` in components, hooks, utils, or page modules.
- Always `export const Name = …` / `export const useName = …`.
- Next.js `page.tsx` / `layout.tsx` are the only place a default export is
  allowed. The route file resolves locale, loads `t`, and renders the named
  page as a **server** component (no `'use client'` on `@bga/pages`):

```tsx
// apps/web/src/app/[locale]/rulebooks/page.tsx
import { RulebooksPage } from '@bga/pages/rulebooks';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const RulebooksRoute = async ({ params }: PageProps<'/[locale]/rulebooks'>) => {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const t = getTranslation(locale);
  return <RulebooksPage t={t} />;
};

export default RulebooksRoute;
```

```tsx
// packages/pages/src/rulebooks/RulebooksPage.tsx — server component
export interface RulebooksPageProps {
  t: TFunction<'common'>;
}

export const RulebooksPage: FC<RulebooksPageProps> = ({ t }) => (
  …
);
```

Do not make `@bga/pages` client components just to call `useTranslation`.
Pass `t` (and other server-resolved values) as props. Client islands stay in
`@bga/components`.

## Pages package

- `@bga/pages` holds the JSX for an entire screen (layout chrome the screen
  owns, feature composition, etc.) as **server** components.
- `apps/web` `app/**/page.tsx` validates locale, calls `getTranslation`, passes
  `t` into the page, and default-exports the route adapter.
- No `*.test.tsx` under `@bga/pages` — cover behaviour via component/hook/util
  tests and optional thin route smoke tests in `apps/web` if needed later.

## What stays in `apps/web`

- `app/` routes, `layout.tsx`, API routes, `proxy.ts`
- i18n catalogues and providers
- app theme / Mantine provider wiring
- test-utils used only by the web app’s own tests

Do not grow new feature folders under `apps/web/src/features` — move or add
units into the packages above.

## Checklist

- [ ] Unit lives in the right package (`components` / `hooks` / `utils` / `pages`)
- [ ] Own folder + local `index.ts` (named re-exports of that unit only)
- [ ] Tests present for components, hooks, and utils; absent for pages
- [ ] No package-root barrel; no `export *` / `import *`
- [ ] No default exports except Next route adapters
- [ ] Imports use `@bga/<package>/<unit-folder>`
