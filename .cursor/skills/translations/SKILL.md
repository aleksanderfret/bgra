---
name: translations
description: Every user-facing string must come from translation catalogues, never hardcoded in source. Use when adding UI copy, alerts, labels, placeholders, aria-text, metadata, engine notices, error codes, or JSX/TSX/Python strings the user could read.
---

# Translations

There must be no hardcoded user-facing text. Everything the user reads is
defined in the translation catalogues.

English is the source language of the repo; Polish is a translation. Both
catalogues must gain a key in the **same change**.

## Where copy lives

| Locale | File |
| --- | --- |
| English (reference) | `apps/web/src/i18n/locales/en/common.json` |
| Polish | `apps/web/src/i18n/locales/pl/common.json` |

One namespace: `common`. Keys are nested JSON, read as dot paths
(`rulesChat.submit`). `t()` is typed against the English file
(`i18n/i18next.d.ts`). `locales.test.ts` fails if a key, a blank value, or an
interpolated `{{name}}` exists in one language and not the other.

## How to put a string on screen

**Client component:** `useTranslation()` then `t('key')`.
**Server component / metadata:** `getTranslation(locale)` then `t('key')`.
**Markup inside copy** (`<command>…</command>`): `Trans` with `i18nKey` and
`components`. Do not concatenate JSX around a hardcoded English sentence.
**Dynamic engine states:** the engine sends a `code` (and `params`). The UI
does `t(\`notice.${code}\`)` or `t(\`answer.error.${code}\`)` with
`defaultValue: t('notice.unknown')` / `t('answer.error.unknown')` — that
fallback is **another key**, never a literal sentence.

```tsx
// Forbidden
<Button>Ask</Button>
<Alert title="Engine error">Something went wrong</Alert>
placeholder="Choose a game"
aria-label="Interface language"

// Required
<Button>{t('rulesChat.submit')}</Button>
<Alert title={t('answer.error.title')}>{t(`answer.error.${code}`)}</Alert>
placeholder={t('rulesChat.game.placeholder')}
aria-label={t('language.label')}
```

```json
// en and pl, same key, same {{placeholders}}
"rulesChat": { "submit": "Ask" }
```

## Adding a key

1. Add the English string under a nested object that matches the screen.
2. Add the Polish string at the **same path**.
3. Use `{{param}}` for interpolations; both files must list the same names.
4. Call `t('the.new.key')` (or `t('the.new.key', { param })`).
5. Run `pnpm --filter web test` — `locales.test.ts` is the mechanical check.

Do not add a key to only one locale and "translate later".

## Engine and Python

The engine **never** sends a sentence for the screen.

- `NoticeEvent.code` + `params` — frontend owns the wording (`notice.*`).
- `ErrorEvent.code` — frontend owns the wording (`answer.error.*`).
- `ErrorEvent.message` — English technical detail for the **log**, shown in a
  quieter register under the translated sentence. Do not use it as the title.
- Status stage names (`transcribing`, …) are codes; copy is `stage.*`.
- `documentKind` values are codes; copy is `documentKind.*`.

If you need a new user-visible engine state: add a code, add `notice.<code>`
(or `answer.error.<code>`) in **both** locale files, then emit the code.

## Not translations (leave them)

These are data, not UI copy:

- Game titles and ids from the library
- Rulebook excerpts and figure captions that came from the index
- The user's spoken transcript (`{{transcript}}` wraps it; the words are theirs)
- Code comments, log lines, test descriptions
- Identifiers (`gameId`, event `type`, HTTP paths)

A test may assert a translated string **by rendering with `locale`**
(`render(<X />, 'pl')`). Do not paste the English sentence into the component
to make the test easier.

## Checklist

- [ ] No literal user-facing string in TS, TSX, or Python
- [ ] New keys exist in `en` and `pl` with the same placeholders
- [ ] Engine changes send codes, not prose
- [ ] `defaultValue` is another `t('…')` key, never `'Some English…'`
