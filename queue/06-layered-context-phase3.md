# Layered context phase 3 — token measurement by layer

**Sphere:** Engine › Infrastructure
**Backlog item:** Layered context phase 3 (token measurement by layer)
**Depends on:** Layered context phases 1+2 (✅ Verified)

## What to build

Phases 1 and 2 of the layered context architecture are live — the system prompt is split into layers and capability files load selectively based on intent detection. Phase 3 adds token counting per layer so we can see how much each layer costs per call. This data feeds the prompt optimization loop.

## Read first

- `specs/LAYERED-CONTEXT.md` — Phase 3 section specifically
- `src/brain/prompt.js` — where prompt assembly happens, where to add counting
- `src/utils/eval-logger.js` — existing logging pattern to follow
- `conversation_evals` table in `src/utils/db.js` — `capabilities_loaded` column already exists

## Done when

- [ ] Per-call token counts by layer (core, each capability file loaded) are logged to `conversation_evals.capabilities_loaded` as JSON
- [ ] Total prompt tokens broken down by: core layer, capability layers, situational layers
- [ ] No behavior change — this is instrumentation only
- [ ] `npm test` passes
- [ ] Feature branch opened, PR against main

## Verify

Trigger a conversation via CLI. Query `conversation_evals` table and confirm `capabilities_loaded` contains a JSON array of which capability files were loaded, with token counts. e.g. `[{"file":"calendar.md","tokens":142},{"file":"home-assistant.md","tokens":203}]`

## Server requirements

- [ ] None — SQLite schema already has the column, no new env vars

## Commit message

`feat(brain): add token counting by prompt layer (layered context phase 3)`
