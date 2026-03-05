# Claude Code Prompt: Morning Briefing Opt-In/Out

Read these files before writing any code:
1. `specs/BRIEFING-OPT-IN-OUT.md` — the full spec
2. `ARCHITECTURE.md` — project design philosophy
3. `DEV-PROTOCOL.md` — build cycle and conventions
4. `.cursorrules` — engineering laws (apply to you too)

## What to build

Two new tools (`briefing_subscribe`, `briefing_status`) and a shared preference resolution utility that lets adults opt in/out of morning briefings via conversation. A SQLite table stores preferences that overlay the existing household.json defaults.

## Patterns to follow

- **Tool pattern:** Look at `src/tools/reminder-set.js` and `src/tools/feature-request.js` for the export shape (`definition` + `execute`), permission checking, error handling, and return format.
- **SQLite pattern:** Look at `src/utils/db.js` for how tables are created on startup. Follow the `CREATE TABLE IF NOT EXISTS` pattern exactly.
- **Capability prompt pattern:** Look at `config/prompts/capabilities/reminders.md` for the format — one line above `---` (what you can do), guidelines below.
- **Prompt loading pattern:** Look at `src/brain/prompt.js` for how `capabilityFiles` and `CAPABILITY_TRIGGERS` are structured.
- **Permission pattern:** Look at `src/utils/permissions.js` for how tools are mapped to permissions.

## Files to create

- `src/tools/briefing-subscribe.js`
- `src/tools/briefing-status.js`
- `src/utils/briefing-preferences.js`
- `config/prompts/capabilities/briefing.md`

## Files to modify

- `src/tools/index.js` — register both tools
- `src/utils/permissions.js` — add both tools to TOOL_PERMISSIONS with `['briefing_manage']`
- `src/utils/db.js` — add `briefing_preferences` table creation
- `src/utils/morning-briefing.js` — replace direct household.json reads with `getEffectiveBriefingConfig()`
- `src/brain/prompt.js` — add briefing to `capabilityFiles` and `CAPABILITY_TRIGGERS`
- `config/household.json` — add `"briefing_manage"` to all five adult members' permissions arrays; add to `permission_definitions`

## Key design point

The preference resolution function (`getEffectiveBriefingConfig`) is the heart of this change. It must be used by both the tools AND the scheduler so the logic isn't duplicated. The spec has the resolution order: SQLite first, household.json fallback, then not-subscribed.

## Branch

`feature/briefing-opt-in-out`. Branch off `main`. Do not merge.

## Commit message

```
feat: morning briefing opt-in/out — conversational subscribe/unsubscribe
```

## Verification

After implementation, run through `specs/BRIEFING-OPT-IN-OUT.verify.md`. At minimum, start the app with `SIGNAL_ENABLED=false node src/index.js` and test the tools via CLI channel.
