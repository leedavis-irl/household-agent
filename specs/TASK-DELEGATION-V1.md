# Spec: Task Delegation v1

**Status:** Not started
**Backlog bucket:** Scheduling & Coordination
**Depends on:** Reminders v1 (✅ Verified), Message Send (✅ Verified)

## Problem

There's no way to assign a task to a household member, track whether it's done, and follow up. "Lee, can you call the plumber?" currently lives in someone's head or a text message that scrolls away. Iji should be the system of record for household tasks — who owes what, what's overdue, and what got done.

## Design Decisions

**Tasks ≠ reminders.** Reminders are time-triggered nudges ("remind me at 3pm"). Tasks are work items with an owner and a lifecycle ("call the plumber by Friday"). They share some DNA (SQLite, person resolution, Signal notifications) but are separate systems with separate tools.

**No separate scheduler in v1.** Reminders have a 60-second scheduler that fires and follows up. Tasks don't need that — they're not millisecond-sensitive. Instead, the morning briefing will surface overdue and due-today tasks. This keeps v1 simple and avoids a second scheduler loop. Follow-up nudging can be added in v2 if needed.

**Notification on assignment only.** When someone assigns a task to another person, Iji sends a Signal DM to the assignee. Completion notifications go back to the creator. No notification for self-assigned tasks (you already know).

**Due dates are optional.** Not every task has a deadline. "Pick up dry cleaning" is a task; it's not due at a specific time. Tasks without a due date still appear in queries but never show as overdue.

## Data Model

### Table: `tasks`

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  creator_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_creator_status ON tasks(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
```

**Status lifecycle:** `open` → `in_progress` → `done` | `cancelled`

- `open` — newly created, not started
- `in_progress` — assignee has acknowledged or started work
- `done` — completed
- `cancelled` — no longer needed

**Priority:** `low` | `normal` | `high` | `urgent`. Default `normal`. Used for display ordering, not automation.

## Tools

### `task_create`

**Definition:**
```json
{
  "name": "task_create",
  "description": "Create a task and optionally assign it to a household member. Defaults to assigning to yourself. Use when someone says 'I need to...', 'can you ask X to...', 'add a task for...', 'we need someone to...'",
  "input_schema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Short task title (what needs to be done)"
      },
      "description": {
        "type": "string",
        "description": "Optional longer description or context"
      },
      "assignee_id": {
        "type": "string",
        "description": "Person id or display name to assign to. Defaults to the person asking. 'me' means yourself."
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"],
        "description": "Task priority. Defaults to normal."
      },
      "due_at": {
        "type": "string",
        "description": "Optional ISO datetime for when the task is due. Claude should resolve natural language relative to current Pacific time."
      }
    },
    "required": ["title"]
  }
}
```

**Behavior:**
- `creator_id` comes from `envelope.person_id` (not passed by Claude)
- `assignee_id` resolves via the same member resolution pattern as reminders (id or display_name, case-insensitive, "me"/"self" → caller)
- If assignee is omitted, defaults to caller
- Assigning to someone else requires `tasks_others` permission
- Validates `due_at` is a valid future datetime if provided (past dates are allowed — sometimes you're logging something already overdue)
- If assignee ≠ creator AND assignee has a Signal identifier, send notification: "📋 New task from {creator}: {title}" (via `sendMessage` directly, not through brain loop)
- Returns: `{ task_id, title, assignee, assignee_id, priority, due_at_local, status: "open" }`

### `task_query`

**Definition:**
```json
{
  "name": "task_query",
  "description": "List tasks. Can filter by assignee, creator, status, and whether overdue. Use when someone asks 'what are my tasks?', 'what did I assign?', 'what's overdue?', 'show tasks for Steve'.",
  "input_schema": {
    "type": "object",
    "properties": {
      "assignee_id": {
        "type": "string",
        "description": "Filter by assignee (person id or display name). 'me' = the person asking."
      },
      "creator_id": {
        "type": "string",
        "description": "Filter by who created the task. 'me' = the person asking."
      },
      "status": {
        "type": "string",
        "enum": ["open", "in_progress", "done", "cancelled", "active"],
        "description": "Filter by status. 'active' means open + in_progress (default)."
      },
      "include_overdue_only": {
        "type": "boolean",
        "description": "If true, only return tasks past their due date."
      }
    }
  }
}
```

**Behavior:**
- If no filters provided, defaults to: assignee = caller, status = active
- `active` is a virtual status meaning `open` OR `in_progress`
- `include_overdue_only` filters to tasks where `due_at < now` AND status is open/in_progress
- Querying another person's tasks requires `tasks_others` permission
- Sort: overdue first (by due_at asc), then by priority (urgent > high > normal > low), then by created_at desc
- Returns: `{ tasks: [...], count, message }` where each task has `{ id, title, description, assignee, creator, status, priority, due_at_local, created_at_local, is_overdue }`

### `task_update`

**Definition:**
```json
{
  "name": "task_update",
  "description": "Update a task's status, priority, assignee, or due date. Use when someone says 'mark that as done', 'I started working on X', 'reassign to Steve', 'push the deadline to Friday', 'cancel that task'.",
  "input_schema": {
    "type": "object",
    "properties": {
      "task_id": {
        "type": "integer",
        "description": "The task ID to update"
      },
      "status": {
        "type": "string",
        "enum": ["open", "in_progress", "done", "cancelled"],
        "description": "New status"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"],
        "description": "New priority"
      },
      "assignee_id": {
        "type": "string",
        "description": "Reassign to a different person (id or display name)"
      },
      "due_at": {
        "type": "string",
        "description": "New due date (ISO datetime)"
      }
    },
    "required": ["task_id"]
  }
}
```

**Behavior:**
- At least one field besides `task_id` must be provided
- Can only update tasks you created OR are assigned to, unless you have `tasks_others`
- Setting status to `done`: sets `completed_at` to now. If creator ≠ assignee, notifies creator via Signal: "✅ {assignee} completed: {title}"
- Setting status to `cancelled`: if creator ≠ assignee, notifies creator: "🚫 {assignee} cancelled task: {title}"
- Reassigning: notifies new assignee via Signal: "📋 Task reassigned to you from {old_assignee}: {title}"
- Updates `updated_at` on every change
- Returns the updated task object

## Permissions

New permissions (following the reminders pattern):
- `tasks` — create, query, and update your own tasks (assigned to you or created by you)
- `tasks_others` — assign tasks to others, query others' tasks, update others' tasks

**household.json changes:**
- All adults get both `tasks` and `tasks_others`
- All children get `tasks` only
- Add to `permission_definitions`

**permissions.js mapping:**
- `task_create`: `['tasks', 'tasks_others']`
- `task_query`: `['tasks', 'tasks_others']`
- `task_update`: `['tasks', 'tasks_others']`

(Tool-level permission grants access to the tool. Cross-person restrictions are enforced inside the tool logic, same as reminders.)

## Capability Prompt

Create `config/prompts/capabilities/tasks.md`:

```
**Tasks** — I can track household tasks and to-dos, assign them to people, and follow up on what's overdue.
---
- Use task_create when someone wants to add a task, to-do, or action item — for themselves or someone else.
- Use task_query when someone asks about their tasks, what's overdue, or what they've assigned to others.
- Use task_update when someone marks a task done, starts working on it, wants to reassign it, change the deadline, or cancel it.
- If someone says "done" or "finished" in context of a recent task discussion, use task_update to mark it complete.
- Default to assigning tasks to the person asking unless they specify someone else.
```

## Prompt Loading

Add to `src/brain/prompt.js`:
- Add `tasks: 'tasks.md'` to `capabilityFiles`
- Add trigger: `tasks: /\b(task|tasks|to.?do|to.?dos|assign|assigned|overdue|delegate|action item)\b/i`

## Morning Briefing Integration

In `src/utils/morning-briefing.js`, add a tasks section to the briefing prompt. After the existing item 4 (household knowledge) and before the feature requests line, add:

```
5. Any tasks assigned to them that are overdue or due today.
```

This doesn't require a code change to the briefing utility itself — just update the prompt template string. The brain loop will use `task_query` to check, same as it uses `calendar_query` for events. Claude decides whether to include it based on whether there's anything noteworthy.

**Important:** Renumber the feature requests line to 6 if it exists.

## Notifications

All notifications use `sendMessage` from `src/broker/signal.js` directly (not through the brain loop). Check that the recipient has a Signal identifier before sending; skip silently if not.

**On task_create (assignee ≠ creator):** `📋 New task from {creator_name}: {title}`
**On task_update → done (assignee ≠ creator):** `✅ {assignee_name} completed: {title}`
**On task_update → cancelled (assignee ≠ creator):** `🚫 {assignee_name} cancelled task: {title}`
**On task_update → reassign:** `📋 Task reassigned to you from {old_assignee_name}: {title}`

## Shared Utility: Member Resolution

The `resolveMemberId` function is duplicated in `reminder-set.js` and `reminder-list.js`. The tasks tools need the same function. **Do not refactor the existing reminder files** — that's out of scope. Instead, create `src/utils/resolve-member.js` with the shared implementation and use it in all three task tools. The reminder tools can be migrated in a future cleanup.

```javascript
// src/utils/resolve-member.js
import { getHousehold } from './config.js';

export function resolveMemberId(input, fallbackId) {
  const id = (input || fallbackId || '').toString().trim().toLowerCase();
  if (!id) return null;
  const household = getHousehold();
  if (id === 'me' || id === 'self') return fallbackId || null;
  if (household.members[id]) return id;
  for (const [memberId, member] of Object.entries(household.members)) {
    if (member.display_name?.toLowerCase() === id) return memberId;
  }
  return null;
}
```

Also include a `formatPacific` helper since task tools need it too:
```javascript
export function formatPacific(isoTs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(isoTs));
}
```

## Files to Create

- `src/tools/task-create.js`
- `src/tools/task-query.js`
- `src/tools/task-update.js`
- `src/utils/resolve-member.js`
- `config/prompts/capabilities/tasks.md`

## Files to Modify

- `src/tools/index.js` — register three new tools
- `src/utils/permissions.js` — add three tools to TOOL_PERMISSIONS
- `src/utils/db.js` — add `tasks` table + indexes to migration
- `src/brain/prompt.js` — add tasks capability file and trigger
- `src/utils/morning-briefing.js` — add tasks to briefing prompt (line in the template string)
- `config/household.json` — add `tasks` and `tasks_others` permissions to members; add to `permission_definitions`

## Server Requirements

- [ ] No new env vars
- [ ] No new external service accounts
- [ ] SQLite table auto-created on startup (existing pattern)
- [ ] `config/household.json` permission changes deploy via git

## Commit Message

```
feat: task delegation v1 — create, query, update tasks across household

- SQLite tasks table with status lifecycle (open/in_progress/done/cancelled)
- task_create, task_query, task_update tools
- Cross-person assignment with Signal notifications
- Morning briefing includes overdue/due-today tasks
- Shared member resolution utility (resolve-member.js)
```
