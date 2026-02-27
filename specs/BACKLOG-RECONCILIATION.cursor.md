# Cursor Prompt: Backlog Reconciliation

## What to do

`BACKLOG.md` has drifted from reality. Some items marked "Not built" or "Fix pending" have actually been shipped. Audit every row against the codebase and update statuses and notes to match what's actually there.

## Read first

- `BACKLOG.md` — the file you're updating
- `src/tools/index.js` — what tools are actually registered
- `src/brain/prompt.js` — capability triggers and system prompt construction
- `src/index.js` — what runs on boot
- `.github/workflows/deploy.yml` — CI/CD pipeline
- `specs/*.md` — check for status lines on completed specs

Then follow the code wherever it leads. You're better at reading the codebase than I am at listing every file.

## Rules

- Update status to match reality: ✅ Verified / 🔧 Fix pending / ⚠️ Untested / ❌ Not built
- If something is built but the backlog says "Not built", fix it. If you're unsure whether it works, use ⚠️ Untested.
- If you find something built that has no backlog row, add one.
- Update the scorecard table to match the new counts.
- Update the Suggested Build Order — remove completed items.
- Do NOT change priority or rollout columns — those are Product decisions.
- Preserve all existing spec/decision links.

## Commit message

```
chore: reconcile backlog against codebase
```
