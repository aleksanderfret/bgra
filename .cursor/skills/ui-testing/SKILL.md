---
name: ui-testing
description: Testing Library rules for UI tests in apps/web. Use when writing or reviewing *.test.tsx, component tests, or queries against the rendered tree. Query and interact the way a user would — roles, labels, text — never CSS selectors or test ids.
paths: apps/web/**/*.test.tsx
---

# UI testing

UI tests must follow [Testing Library](https://testing-library.com/docs/queries/about/#priority):
query and interact the way a person (or assistive technology) uses the screen.

This applies to `*.test.tsx` that render components. Pure modules
(`answer-state.ts`, `locales.test.ts`, `routing.test.ts`) stay unit tests
without the DOM.

## Query priority

Use the first query that fits. Do not skip down the list for convenience.

1. **`getByRole`** — `button`, `radio`, `radiogroup`, `textbox`, `alert`,
   `img`, `navigation`, `status`, with `{ name: '…' }` when the control has
   an accessible name.
2. **`getByLabelText`** — form fields whose name comes from a `<label>`.
3. **`getByPlaceholderText`** — only if there is no label.
4. **`getByText`** — non-interactive copy (headings, descriptions, body).
5. **`getByDisplayValue`** — the current value of an input the user can edit.
6. **`getByAltText`** — prefer `getByRole('img', { name })` instead.

**Forbidden in UI tests**

- `container.querySelector`, `document.querySelector`, `.closest`, `.firstChild`
- `getByTestId` / `data-testid` added so a test can find a node
- class names, inline styles, component props, or internal state
- `fireEvent` when `userEvent` can do the same thing (`click`, `type`, `keyboard`, `tab`)

## Interact like a user

```tsx
// Forbidden
element.focus();
fireEvent.change(input, { target: { value: '…' } });
container.querySelector('code');

// Required
await userEvent.click(screen.getByRole('radio', { name: en.colorScheme.dark }));
await userEvent.keyboard('{ArrowLeft}');
await userEvent.type(screen.getByLabelText(en.rulesChat.question.label), '…');
```

Focus moves through the widget (`click` / `tab`), then keys. Do not call
`.focus()` to set up a keyboard test.

Async UI: `findByRole` / `findByText`, not `waitFor` plus `getBy` unless you
are asserting a negative or a non-element condition.

## Copy in assertions

Translated UI is looked up from the catalogues (`en` / `pl`), never from a
literal English sentence you typed in the test. User- or engine-supplied data
(answer tokens, `gameId`, transcripts, `ErrorEvent.message`) is data — assert
that text as the user reads it.

```tsx
expect(screen.getByRole('alert')).toHaveTextContent(pl.answer.error.engine_unreachable);
expect(screen.getByRole('img', { name: altFromCatalogue })).toBeInTheDocument();
```

Render through `@/test-utils` (`render`, `screen`, `userEvent`, `within`).
Pass `locale` when the assertion is about a specific language.

## Exceptions

- `html[data-mantine-color-scheme]` is the document theme the user sees.
  Asserting that attribute is allowed after a visible control change.
- `toHaveAttribute('lang', …)` on a language name is allowed — AT uses it.
- If a node has no role and no accessible name, **fix the component**
  (label, `aria-label` from `t()`, `role`) rather than weakening the test.
