---
name: premortem
description: Identify failure modes before they happen using a pre-mortem (Gary Klein; tigers / paper tigers / elephants). Use before implementing a feature, committing to an architecture, writing a plan, or when the user says premortem, pre-mortem, risk, or "what could go wrong".
---

# Premortem

Imagine it is three months later and this change has failed spectacularly. Work
backwards: why did it fail? Do this **before** writing implementation code.

Based on Gary Klein's pre-mortem, with Shreyas Doshi's labels:

| Label | Meaning |
| --- | --- |
| **Tiger** | A real threat. It will hurt us if we ship without addressing it. |
| **Paper tiger** | Looks scary; already mitigated or out of scope. |
| **Elephant** | An unspoken concern the plan is avoiding. |

## When

- Before implementing a non-trivial feature or architectural choice.
- Before changing retrieval, streaming, i18n, auth, or anything that can invent rules.
- When the user invokes `/premortem` or asks what could go wrong.
- Skip for one-line typo fixes and comments.

## Depth

- **Quick** (plans, small PRs): five questions, two-pass verify, then present.
- **Deep** (new feature, new subsystem): the checklists below, grounded in this repo.

If the user did not pick a depth: **quick** for a local change, **deep** before
implementation of a new path.

## Two-pass rule (required)

Do not flag a tiger from pattern-matching alone.

1. List *potential* risks.
2. For each one, read the surrounding code or spec (±20 lines, callers, tests).
3. Only then label it tiger / paper tiger / false alarm / elephant.

A tiger **must** include `mitigation_checked`: what safeguard you looked for and
did **not** find. If you cannot fill that in, it is not a tiger.

## Quick questions

1. What is the single biggest thing that could go wrong for the user at the table?
2. Any external dependency (engine, model, filesystem, network) that can fail?
3. Can we roll this back, or does it poison the index / cache / locale files?
4. Which edge case has no test?
5. Which requirement is still fuzzy enough to force a rewrite?

## Deep checklists

Work through each category. Skip items that cannot apply; do not invent cloud
scale problems this local-first app does not have.

**Product / RAG (this repo's real tigers)**

- Can retrieval ever run without a `gameId`, or leak chunks from another game?
- Can the model name a file path, or can the UI render a figure id that is not
  in `sources`?
- If retrieval finds nothing, do we still produce an answer instead of
  `insufficient_evidence`?
- Could a transcript be treated as a rules source?
- Would a user-facing string land in code or in the engine instead of `en`/`pl`
  locale files?

**Technical**

- Failure modes of the SSE stream (hang, missing `done`, mid-chunk cut).
- Contract drift: TS types vs `contract.py` vs `test_contract_parity.py`.
- Python venv / path relocation (`uv run` console scripts).
- Missing tests for the pure logic (decoder, answer reducer).

**Integration**

- Next.js proxy vs engine bound to localhost.
- Optional extras (`ingest` / `retrieval` / `speech`) assumed installed.
- Hook / CI `pnpm verify` that the change would fail.

**Process**

- Unclear acceptance criteria from `docs/ROADMAP.md`.
- Docs in `ARCHITECTURE.md` that this change would contradict.

## Output

```markdown
## Premortem

**Mode**: quick | deep
**Context**: <what is being analysed>

### Tigers
- **Risk**: …
  **Where**: `path:line`
  **Severity**: high | medium
  **Mitigation checked**: <what is missing>
  **Fix**: <concrete change or test>

### Elephants
- **Risk**: …
  **Fix**: …

### Paper tigers
- **Risk**: …
  **Why it is fine**: <cite the mitigation>

### False alarms
- **Finding**: …
  **Why discarded**: …
```

Then ask how to proceed: mitigate tigers first, accept and continue, or drop
the approach. Do not start implementation until the user has answered, unless
they already said to treat tigers as blocking and continue.

## Style

- Concrete: file, function, invariant — not "security could be compromised".
- Proportional: a minor, unlikely issue does not justify a rewrite.
- This skill produces risks and mitigations, not the feature itself.
