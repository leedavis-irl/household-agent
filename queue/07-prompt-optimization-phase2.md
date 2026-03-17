# Prompt optimization phase 2 — batch eval script

**Sphere:** Engine › Infrastructure
**Backlog item:** Prompt optimization loop (phase 2 — batch eval script)
**Depends on:** conversation_evals table and eval-logger (✅ Verified)

## What to build

Phase 1 (logging) is live. Phase 2 adds a script that runs weekly, pulls all unscored conversations from the past 7 days, sends each to Claude for evaluation (1-5 score + failure category), and writes scores back to `conversation_evals`. This is the data engine for the monthly prompt optimization cycle.

Full design is in the spec — follow it exactly.

## Read first

- `specs/PROMPT-OPTIMIZATION.md` — Phase 2 section, including the evaluator prompt verbatim
- `src/utils/eval-logger.js` — understand what's being logged
- `src/utils/db.js` — `conversation_evals` table schema
- `scripts/health-check.js` — follow this pattern for a standalone script

## Done when

- [ ] `scripts/eval-conversations.js` exists and runs without errors: `node scripts/eval-conversations.js`
- [ ] Pulls unscored conversations (no `quality_score`) from the past 7 days
- [ ] Sends each to Claude using the evaluator prompt from the spec
- [ ] Parses JSON response and writes `quality_score`, `failure_category`, `quality_notes`, `eval_source='llm_eval'` back to the row
- [ ] Logs a summary: N conversations evaluated, average score, failure category breakdown
- [ ] Handles API errors gracefully — skip and continue, don't crash
- [ ] Committed to main (documentation-only exception doesn't apply — this is a script)

## Verify

Manually run `node scripts/eval-conversations.js`. Confirm rows in `conversation_evals` now have `quality_score` populated. Check the summary output for a sensible breakdown.

## Server requirements

- [ ] No new env vars (`ANTHROPIC_API_KEY` already present)
- [ ] Script runs on EC2 — can be added to cron later, but manual first

## Commit message

`feat(eval): add weekly conversation evaluation script (prompt optimization phase 2)`
