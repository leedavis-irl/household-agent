# Spec: Reminders v1

**Decision:** `docs/decisions/2026-02-26-reminders-v1.md`
**Backlog bucket:** Scheduling & Coordination

## Problem

Iji is purely reactive — it only acts when someone messages it. Household members have no way to say "remind me later" and have Iji follow through. This is the most-requested missing primitive and the prerequisite for morning briefings, proactive conflict alerts, and other scheduled behaviors.

## Scope

Time-based reminders only. Set for yourself or for others. Natural language time parsing. Follow-up cycle until completed or rescheduled. List pending reminders. Delete completed reminders.

**Not in v1:** Location-based reminders, recurring reminders, integration with calendar or morning briefings.

## Data Model

New `reminders` table in existing SQLite database (`src/utils/db.js` migration):

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  creator_id TEXT NOT NULL,          -- person_id who created it
  target_id TEXT NOT NULL,           -- person_id who receives it
  fire_at TEXT NOT NULL,             -- ISO 8601 datetime, always stored as UTC
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | fired | snoozed
  follow_up_at TEXT,                 -- when to check if completed, UTC
  snooze_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fired_at TEXT,
  completed_at TEXT
);

CREATE INDEX idx_reminders_status_fire ON reminders(status, fire_at);
```

**Status lifecycle:** pending → fired → (snoozed → fired →)* deleted

Completed reminders are deleted, not kept. The table only holds active/pending work.

## Tools

### reminder_set

**Called by Iji when:** person asks to be reminded of something, or asks to remind someone else.

**Input (from Claude tool call):**
```json
{
  "message": "Call the dentist",
  "target_id": "lee",
  "fire_at": "2026-02-27T15:00:00-08:00"
}
```

- `creator_id` is injected from the conversation context (the person talking to Iji), not passed by Claude
- `fire_at` is parsed by Claude from natural language ("tomorrow at 3pm"). System prompt must instruct Claude to resolve relative times using the injected current datetime and default to Pacific time
- If `target_id` is omitted or "me", defaults to `creator_id`
- `follow_up_at` is automatically set to `fire_at + 30 minutes`

**Returns:** Confirmation object with reminder id, message, target, fire time (formatted in Pacific).

**Claude prompt guidance:** When someone says "remind me to X", use `reminder_set`. Parse the time from their message. If the time is ambiguous, ask for clarification. If they say "remind Steve to X", look up Steve's person_id from the household roster. Always confirm what was set: "Got it — I'll remind you tomorrow at 3pm to call the dentist."

### reminder_list

**Called by Iji when:** person asks "what are my reminders?" or "show me my reminders."

**Input:**
```json
{
  "target_id": "lee"
}
```

- If omitted, defaults to the person asking
- Returns all reminders where target_id matches AND status is 'pending' or 'snoozed'
- Sorted by fire_at ascending

**Returns:** Array of reminder objects with id, message, fire_at (Pacific), status, snooze_count.

**Claude prompt guidance:** Format as a concise list. Include relative time ("in 2 hours", "tomorrow at 3pm"). If no reminders, say so warmly.

### reminder_update

**Called by Iji when:** during follow-up conversation, person says they completed it or wants to snooze.

**Input:**
```json
{
  "reminder_id": 42,
  "action": "complete"
}
```

OR

```json
{
  "reminder_id": 42,
  "action": "snooze",
  "snooze_until": "2026-02-27T17:00:00-08:00"
}
```

OR

```json
{
  "reminder_id": 42,
  "action": "cancel"
}
```

**Actions:**
- `complete` — deletes the reminder from the table. If creator ≠ target, sends a notification to creator: "✅ {target} completed: {message}"
- `snooze` — sets status back to 'pending', updates fire_at to snooze_until, sets new follow_up_at to snooze_until + 30 min, increments snooze_count
- `cancel` — deletes the reminder. If creator ≠ target, notifies creator: "🚫 {target} cancelled reminder: {message}"

**Claude prompt guidance:** When following up on a fired reminder and the person says "done" or "yes" or "took care of it", call reminder_update with action "complete". If they say "not yet" or "push it to 5pm", call with action "snooze" and parse the new time. If they say "never mind" or "cancel it", call with action "cancel".

## Scheduler

New file: `src/scheduler/reminders.js`

A loop that runs every 60 seconds (using `setInterval`). On each tick:

1. Query: `SELECT * FROM reminders WHERE status = 'pending' AND fire_at <= datetime('now')`
2. For each due reminder:
   a. Send Signal DM to `target_id` with the reminder message
   b. Update status to 'fired', set fired_at to now
   c. Set follow_up_at to now + 30 minutes
   d. If `creator_id` ≠ `target_id`, send Signal DM to creator: "📨 Reminder delivered to {target}: {message}"

3. Query: `SELECT * FROM reminders WHERE status = 'fired' AND follow_up_at <= datetime('now')`
4. For each due follow-up:
   a. Send Signal DM to `target_id`: "Hey — did you get to: {message}? Let me know if it's done or if you want me to push it."
   b. Update follow_up_at to now + 30 minutes (so it follows up again if no response)
   c. Cap at 3 follow-ups (after 3, set status to 'snoozed' and stop. Don't nag forever.)

### Starting the scheduler

Import and start in `src/index.js` (or wherever the main process initializes), after the database is ready. The scheduler shares the same SQLite connection and Signal send infrastructure.

### Sending messages from the scheduler

The scheduler needs access to `message_send` (the existing Signal sending path) but outside of a conversation context. This means:

- It sends as Iji (not as a tool call within a conversation)
- It uses the same Signal broker (`src/broker/signal.js`) that tool calls use
- Messages sent by the scheduler should be simple text, not Claude-composed (no brain loop for fire/follow-up — just the stored message text with a prefix)

**Fire message format:** "⏰ Reminder: {message}"
**Follow-up message format:** "Did you get to this? → {message}\nReply 'done', or tell me when to remind you again."
**Creator notification (delivered):** "📨 Reminder delivered to {target_name}: {message}"
**Creator notification (completed):** "✅ {target_name} completed: {message}"
**Creator notification (cancelled):** "🚫 {target_name} cancelled: {message}"

### Handling responses to follow-ups

When a person replies to a follow-up, it comes in as a normal inbound Signal message to Iji. The brain needs to know there's an active fired reminder for this person so Claude can route the response to `reminder_update`.

**Approach:** When building the system prompt for a person who has `status = 'fired'` reminders, include them as context: "This person has outstanding reminders: [list]. If they seem to be responding to one, use reminder_update."

Add to `buildSystemPrompt` in `src/brain/prompt.js`:
- Query fired reminders for the current person_id
- If any exist, append them to the system prompt as context
- This keeps it in the existing brain loop — no special routing needed

## Permissions

Uses existing permission system. New permission: `reminders`.

- `reminders` — can set, list, and manage reminders for self
- `reminders_others` — can set reminders for other household members

Add to `config/household.json` for each person.

Adults get both. Kids get `reminders` only (can set for themselves, not others).

## Capability File

New file: `config/prompts/capabilities/reminders.md`

Add trigger to CAPABILITY_TRIGGERS in `src/brain/prompt.js`:
```javascript
reminders: /\b(remind|reminder|reminders|don't forget|don't let me forget|nudge|follow up|snooze)\b/i,
```

## Error Cases

- **Ambiguous time:** Claude asks for clarification ("When should I remind you?")
- **Past time:** Tool rejects with error. Claude says "That time has already passed — when would you like the reminder?"
- **Unknown target:** Tool rejects. Claude says "I don't know who that is. Who should I remind?"
- **Target has no Signal:** Tool rejects. Claude explains the limitation.
- **Scheduler down:** Reminders just fire late when the process restarts (they persist in SQLite). No data loss.

## Files to Create

- `src/tools/reminder-set.js` — tool implementation
- `src/tools/reminder-list.js` — tool implementation
- `src/tools/reminder-update.js` — tool implementation
- `src/scheduler/reminders.js` — scheduler loop
- `config/prompts/capabilities/reminders.md` — capability prompt

## Files to Modify

- `src/utils/db.js` — add reminders table migration
- `src/brain/prompt.js` — add reminders to CAPABILITY_TRIGGERS, inject fired reminders as context
- `src/brain/tools.js` (or wherever tools are registered) — register three new tools
- `src/index.js` — start scheduler after db init
- `config/household.json` — add reminders permissions to household members

## Verification

1. Send Iji: "Remind me in 2 minutes to test reminders" → confirm it fires via Signal DM in ~2 minutes
2. Don't respond to follow-up → confirm second follow-up arrives 30 min later
3. Reply "done" → confirm reminder is deleted, reminder_list returns empty
4. Set reminder for another person → confirm creator gets delivery notification → target completes → confirm creator gets completion notification
5. "Show me my reminders" → confirm list shows pending items sorted by time
6. "Remind me yesterday to do something" → confirm graceful error
7. Kill and restart iji.service → confirm pending reminders still fire (persistence test)
