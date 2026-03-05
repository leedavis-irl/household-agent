# Claude Code Handoff: Task Delegation v1

You are implementing the Task Delegation v1 feature for Iji, a household AI agent.

## Before You Start

Read these files in order. Do not write any code until you have read all of them.

1. `ARCHITECTURE.md` — understand the four-flow design
2. `DEV-PROTOCOL.md` — understand the build cycle
3. `.cursorrules` — engineering laws you must follow
4. `specs/TASK-DELEGATION-V1.md` — the full spec for this feature
5. `specs/TASK-DELEGATION-V1.verify.md` — the verification checklist

Then read these existing files to understand the patterns you must follow:

6. `src/tools/reminder-set.js` — tool structure: definition + execute exports, error handling, member resolution, Signal notifications
7. `src/tools/reminder-list.js` — query tool pattern, formatting, permissions
8. `src/tools/reminder-update.js` — update tool pattern, status transitions, cross-person notifications
9. `src/scheduler/reminders.js` — (read-only context, do NOT modify)
10. `src/utils/permissions.js` — how tool permissions are mapped
11. `src/utils/db.js` — migration pattern (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
12. `src/tools/index.js` — tool registration pattern
13. `src/brain/prompt.js` — capability files, trigger patterns
14. `src/utils/morning-briefing.js` — briefing prompt template (you'll add one line)
15. `config/household.json` — member structure, permissions arrays
16. `src/broker/signal.js` — sendMessage function signature (for direct notifications)

## What to Build

### Files to Create (5)

1. **`src/utils/resolve-member.js`** — shared utility with `resolveMemberId(input, fallbackId)` and `formatPacific(isoTs)`. Extract the pattern from reminder-set.js. Use in all three task tools. Do NOT modify the existing reminder files.

2. **`src/tools/task-create.js`** — `definition` + `execute` exports. See spec for schema. Key behaviors:
   - creator_id from envelope.person_id
   - assignee defaults to caller if omitted
   - Cross-person assignment needs `tasks_others` permission (check inside tool logic, not just tool-level permission)
   - Signal notification to assignee when assignee ≠ creator (use sendMessage directly, check for Signal identifier first)
   - Validate due_at is parseable if provided (past dates ARE allowed)

3. **`src/tools/task-query.js`** — `definition` + `execute` exports. Key behaviors:
   - Default: assignee = caller, status = active (open + in_progress)
   - `active` is a virtual status, translate to SQL WHERE clause
   - include_overdue_only: filter where due_at < now AND status in (open, in_progress)
   - Sort: overdue first, then priority (urgent > high > normal > low), then created_at desc
   - Cross-person query needs `tasks_others` permission
   - Each returned task includes `is_overdue` boolean

4. **`src/tools/task-update.js`** — `definition` + `execute` exports. Key behaviors:
   - Requires at least one field besides task_id
   - Can only update tasks you created OR are assigned to, unless tasks_others
   - done → sets completed_at, notifies creator if different from assignee
   - cancelled → notifies creator if different from assignee
   - Reassign → notifies new assignee
   - Always update updated_at
   - All notifications via sendMessage, check Signal identifier

5. **`config/prompts/capabilities/tasks.md`** — capability prompt. See spec for exact content.

### Files to Modify (6)

6. **`src/tools/index.js`** — import and register task_create, task_query, task_update

7. **`src/utils/permissions.js`** — add three entries to TOOL_PERMISSIONS:
   - task_create: ['tasks', 'tasks_others']
   - task_query: ['tasks', 'tasks_others']
   - task_update: ['tasks', 'tasks_others']

8. **`src/utils/db.js`** — add tasks table and indexes to the migrate function

9. **`src/brain/prompt.js`** — add `tasks: 'tasks.md'` to capabilityFiles, add trigger regex

10. **`src/utils/morning-briefing.js`** — add tasks line to the briefing prompt template string (item 5, renumber feature requests to 6)

11. **`config/household.json`** — add `tasks` and `tasks_others` to all adults' permissions arrays. Add `tasks` only to children. Add both to `permission_definitions`.

## Critical Rules

- Follow the exact export pattern of existing tools: `export const definition = { ... }` and `export async function execute(input, envelope) { ... }`
- Use `import` not `require`
- Use try/catch with `{ error: "..." }` returns, not thrown exceptions
- Use the logger (`import log from '../utils/logger.js'`)
- Do NOT modify any existing reminder files
- Do NOT create a scheduler — tasks surface through morning briefings and queries only
- Do NOT touch files outside the spec scope
- Notification messages use the exact emoji + format from the spec

## Branch and Commit

- Create branch: `feature/task-delegation-v1`
- Single commit with message from spec
- Do not push
