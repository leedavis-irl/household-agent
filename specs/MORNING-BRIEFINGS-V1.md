# Spec: Morning Briefings v1

**Status:** ✅ Complete (verified 2026-02-26, commit 5ca333f)
**Decision:** `docs/decisions/2026-02-26-morning-briefings-v1.md`
**Backlog bucket:** Scheduling & Coordination / Weather & Daily Ops
**Upgrades:** `src/utils/morning-briefing.js` (existing v0)

## Problem

Iji should deliver a daily morning briefing to each subscribed adult — a concise Signal DM with everything they need to know to start their day. A v0 exists but has a timing bug (~50% miss rate), hardcoded env-var config, and no email digest.

## Scope

Upgrade existing `src/utils/morning-briefing.js` to:
1. Fix timing bug (window-based check instead of exact-minute match)
2. Read per-person config from `household.json` instead of env vars
3. Retain Claude-composed approach (send through `think()`)

**Not in v1:** Email digest (deferred to v2 — requires OAuth token rollout to more members), per-person delivery *minute* (hour granularity only), Trello integration, opt-in/out via conversational command (config-file only), briefing history/replay.

## Config Changes

### household.json

Add a `briefing` key to each member who should receive briefings:

```json
{
  "lee": {
    "display_name": "Lee",
    "briefing": {
      "enabled": true,
      "delivery_hour": 9
    },
    ...
  },
  "kelly": {
    "display_name": "Kelly",
    "briefing": {
      "enabled": true,
      "delivery_hour": 9
    },
    ...
  }
}
```

Rules:
- No `briefing` key = no briefing
- `briefing.enabled: false` = explicitly disabled
- `delivery_hour` is 0-23 in Pacific time
- Only members with a Signal identifier can receive briefings (log warning and skip others)

### Environment

- `BRIEFING_ENABLED=false` remains as a **global kill switch** — if set to `false`, no briefings fire regardless of per-person config. Useful for dev environments.
- Remove `BRIEFING_HOUR` and `BRIEFING_RECIPIENTS` env vars — these are now per-person in household.json.
- Update `.env.example` to reflect the change.

## Scheduler Changes

### Timing fix

Replace the current check:
```javascript
// BROKEN: ~50% miss rate
if (hour !== BRIEFING_HOUR || minute !== 0) return;
```

With a window-based approach:
```javascript
// If current hour >= delivery_hour AND not yet sent today → send
```

The `sentToday` set already handles deduplication. The fix is simply removing the `minute === 0` check and comparing `hour >= delivery_hour` per person. This means:
- If Iji restarts at 9am and someone's delivery_hour is 7, they still get their briefing
- If Iji is down all morning and comes back at noon, briefings still fire (late but not lost)
- The 60-second check interval is fine — it just needs to catch the right hour window

### Per-person loop

Instead of iterating `BRIEFING_RECIPIENTS`, read `household.json` members and filter to those with `briefing.enabled: true` and a Signal identifier. For each eligible person, check if `currentPacificHour >= member.briefing.delivery_hour` and not yet sent today.

## Briefing Prompt

The prompt sent through `think()` as the `envelope.message`. This is what Claude sees and uses to compose the briefing. Updated from v0 to include email:

```
Generate a morning briefing for {display_name}. Today is {longDate}.

Check the following and include anything noteworthy:
1. Their calendar for today — events, times, locations. Flag conflicts with other household members if you spot them.
2. Current weather and today's forecast — mention only if it affects plans or is notable.
3. Pending reminders due today or overdue.
4. Anything stored in household knowledge in the last 24 hours that's relevant to them.

Keep it concise — this is a Signal message, not an email. Lead with the most important item. Skip sections with nothing noteworthy (don't say "no reminders" — just omit). Write like a Chief of Staff giving a 30-second verbal briefing.
```

### Delivery channel

Briefings are delivered as **Signal DMs** to each person's configured Signal number. This uses the existing `sendMessage()` path from `src/broker/signal.js`.

### Envelope shape

The envelope passed to `think()` should look like a real message from that person, so the brain builds the right system prompt with their permissions and capabilities:

```javascript
{
  person_id: personId,
  person: member.display_name,
  role: member.role,
  permissions: member.permissions || [],
  message: briefingPrompt,        // the composed prompt above
  source_channel: 'signal',
  reply_address: member.identifiers.signal,
  conversation_id: `briefing-${personId}-${dateKey}`,  // unique per person per day
  timestamp: new Date().toISOString(),
}
```

Note: conversation_id now includes personId (v0 used a shared id which could bleed context between recipients).

## Error Handling

- **Signal send failure:** Log error, don't retry (will try again tomorrow). Already handled in v0.
- **think() throws:** Catch, log with person_id, continue to next recipient. Already handled in v0.
- **Missing Signal identifier:** Log warning, skip. Already handled in v0.
- **All tools fail (e.g., calendar API down):** Claude will compose what it can and note what it couldn't check. The brain loop handles this naturally.

## Files to Modify

- `src/utils/morning-briefing.js` — rewrite scheduler logic (timing fix, per-person config, updated prompt)
- `config/household.json` — add `briefing` config to Lee and Kelly
- `.env.example` — update briefing env var documentation

## Files NOT Created

No new files. This is an upgrade of the existing scheduler file. No new tools — the briefing uses existing tools through the brain loop.

## Server Requirements

- [ ] No new env vars required (removing old ones, reading from household.json instead)
- [ ] `BRIEFING_ENABLED` env var on EC2: verify it's not set to `false` (or is absent, which defaults to enabled)
- [ ] `config/household.json` changes deploy via git (CI handles this)
- [ ] No OAuth tokens needed for v1 (email digest deferred to v2)

## Commit Message

```
feat: morning briefings v1 — per-person timing, timing fix

- Fix scheduler timing bug (window-based check replaces exact-minute match)
- Move config from env vars to household.json per-person briefing settings
- Unique conversation_id per person prevents context bleed
- Decision: docs/decisions/2026-02-26-morning-briefings-v1.md
```

## Verification

See `specs/MORNING-BRIEFINGS-V1.verify.md`
