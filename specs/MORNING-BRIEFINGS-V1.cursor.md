# Cursor Prompt: Morning Briefings v1

## What to build

Upgrade the existing morning briefing scheduler to v1. This is a modification of existing code, not a new feature.

## Read first

1. `specs/MORNING-BRIEFINGS-V1.md` — the full spec (timing fix, config changes, prompt update)
2. `src/utils/morning-briefing.js` — the existing v0 code you're modifying
3. `src/scheduler/reminders.js` — sibling scheduler for pattern reference
4. `config/household.json` — where per-person briefing config goes
5. `ARCHITECTURE.md` — overall system context

## Key changes

1. **Fix timing bug** in `src/utils/morning-briefing.js`: replace `hour === X && minute === 0` with `hour >= deliveryHour` per person (sentToday set already prevents double-send)
2. **Read config from household.json** instead of env vars (`BRIEFING_HOUR`, `BRIEFING_RECIPIENTS`). Keep `BRIEFING_ENABLED` as global kill switch only.
3. **Update briefing prompt** — calendar, weather, reminders, knowledge. No email (deferred to v2).
4. **Unique conversation_id per person** (`briefing-${personId}-${dateKey}` not shared)
5. **Add `briefing` config** to Lee and Kelly in `config/household.json` with `delivery_hour: 9`
6. **Update `.env.example`** — remove `BRIEFING_HOUR`/`BRIEFING_RECIPIENTS` docs, keep `BRIEFING_ENABLED`

## What NOT to change

- Don't change the `think()` interface or brain loop
- Don't create new tool files
- Don't modify `src/index.js` (the import already exists)
- Don't change the 60-second check interval

## Commit message

```
feat: morning briefings v1 — per-person timing, timing fix

- Fix scheduler timing bug (window-based check replaces exact-minute match)
- Move config from env vars to household.json per-person briefing settings
- Unique conversation_id per person prevents context bleed
- Decision: docs/decisions/2026-02-26-morning-briefings-v1.md
```
