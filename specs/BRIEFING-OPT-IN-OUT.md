# Spec: Morning Briefing Opt-In/Out

**Status:** Not started
**Backlog bucket:** Scheduling & Coordination
**Depends on:** Morning Briefings v1 (✅ Verified)

## Problem

Briefing subscriptions are currently config-file only — Lee has to edit `household.json` and deploy to change anyone's settings. Adults should be able to subscribe, unsubscribe, and change their delivery hour by talking to Iji directly.

## Design Decision: SQLite preferences, not household.json edits

The briefing settings in `household.json` become **defaults**. A new `briefing_preferences` SQLite table stores per-person overrides set via conversation. The morning briefing scheduler checks SQLite first, falls back to `household.json`.

Why not write to `household.json` from a tool?
- `household.json` is committed to git and deployed via CI. Runtime writes would create drift between repo and server.
- SQLite is already the pattern for runtime state (knowledge, reminders, conversation_evals, feature_requests).
- This also means an adult who currently has no `briefing` block in household.json (Steve, Hallie, Firen) can opt in without a code change.

## Data Model

### Table: `briefing_preferences`

```sql
CREATE TABLE IF NOT EXISTS briefing_preferences (
  person_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,          -- 1 = on, 0 = off
  delivery_hour INTEGER,             -- 0-23 Pacific, NULL = use household.json default or 9
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL           -- person_id of who made the change
);
```

### Resolution order (in morning briefing scheduler)

For each household member:
1. Check `briefing_preferences` for a row with their `person_id`
2. If found: use `enabled` and `delivery_hour` from SQLite (NULL delivery_hour → fall back to household.json → fall back to 9)
3. If not found: use `household.json` `briefing.enabled` / `briefing.delivery_hour`
4. If neither exists: not subscribed (current behavior preserved)

## Tools

### `briefing_subscribe`

Lets a person opt in or out, and optionally set their delivery hour.

**Definition:**
```json
{
  "name": "briefing_subscribe",
  "description": "Subscribe or unsubscribe from the daily morning briefing, and optionally change delivery time.",
  "input_schema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "description": "true to subscribe, false to unsubscribe"
      },
      "delivery_hour": {
        "type": "integer",
        "description": "Hour to receive briefing (0-23, Pacific time). Optional — keeps current setting if omitted."
      }
    },
    "required": ["enabled"]
  }
}
```

**Behavior:**
- Upserts into `briefing_preferences` with the caller's `person_id`.
- `updated_by` = caller's `person_id` (no cross-person management in v1).
- Validates `delivery_hour` is 0-23 if provided.
- Returns confirmation: `{ status: "subscribed", delivery_hour: 9 }` or `{ status: "unsubscribed" }`.

**Permission:** `briefing_manage` — new permission. Only adults should toggle briefings. Add to all adult members.

### `briefing_status`

Shows a person's current briefing settings (resolved from SQLite + household.json).

**Definition:**
```json
{
  "name": "briefing_status",
  "description": "Check your current morning briefing subscription status and delivery time.",
  "input_schema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```

**Behavior:**
- Resolves the caller's effective briefing settings using the same resolution order as the scheduler.
- Returns: `{ subscribed: true, delivery_hour: 9, source: "preference" }` or `{ subscribed: false, source: "default" }`.

**Permission:** `briefing_manage`.

## Changes to Morning Briefing Scheduler

`src/utils/morning-briefing.js` currently reads `member.briefing.enabled` and `member.briefing.delivery_hour` directly from household.json. Change it to call a shared resolution function that checks SQLite first.

### New utility: `src/utils/briefing-preferences.js`

```
export function getEffectiveBriefingConfig(personId, householdMember)
```

- Checks `briefing_preferences` table for `personId`
- Falls back to `householdMember.briefing` from household.json
- Returns `{ enabled: boolean, deliveryHour: number }` or `null` (not subscribed anywhere)

This function is used by both the scheduler and the `briefing_status` tool, keeping resolution logic in one place.

### Schema initialization

Add the `CREATE TABLE IF NOT EXISTS` to `src/utils/db.js` alongside the existing tables (knowledge, reminders, conversation_evals, feature_requests). Follow the exact pattern used there.

## Capability Prompt

Create `config/prompts/capabilities/briefing.md`:

```
**Morning Briefing** — I send a daily morning briefing via Signal with your calendar, weather, reminders, and household updates.
---
- Use briefing_subscribe when someone wants to start or stop getting morning briefings, or change their delivery time.
- Use briefing_status when someone asks about their current briefing settings.
- Adults can opt in even if they weren't originally configured for briefings.
```

## Prompt Loading

Add to `src/brain/prompt.js`:
- Add `briefing: 'briefing.md'` to `capabilityFiles`
- Add trigger pattern to `CAPABILITY_TRIGGERS`: `/\b(briefing|morning briefing|daily briefing|subscribe|unsubscribe|opt.in|opt.out)\b/i`

## Files to Create

- `src/tools/briefing-subscribe.js` — subscribe/unsubscribe tool
- `src/tools/briefing-status.js` — status check tool
- `src/utils/briefing-preferences.js` — shared preference resolution
- `config/prompts/capabilities/briefing.md` — capability prompt

## Files to Modify

- `src/tools/index.js` — register both new tools
- `src/utils/permissions.js` — add `briefing_subscribe` and `briefing_status` to TOOL_PERMISSIONS
- `src/utils/db.js` — add `briefing_preferences` table creation
- `src/utils/morning-briefing.js` — use `getEffectiveBriefingConfig()` instead of reading household.json directly
- `src/brain/prompt.js` — add briefing capability file and trigger
- `config/household.json` — add `briefing_manage` permission to all adult members; add to `permission_definitions`

## Server Requirements

- [ ] No new env vars
- [ ] No new external service accounts
- [ ] SQLite table auto-created on startup (existing pattern)
- [ ] `config/household.json` permission changes deploy via git

## Commit Message

```
feat: morning briefing opt-in/out — conversational subscribe/unsubscribe

- SQLite briefing_preferences table overlays household.json defaults
- briefing_subscribe + briefing_status tools
- Shared preference resolution for scheduler + tools
- Adults can opt in/out and set delivery hour via conversation
```
