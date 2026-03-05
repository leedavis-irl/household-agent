# Verification: Task Delegation v1

## Tool Tests (CLI)

### task_create — self-assignment
1. As Lee: "I need to call the plumber"
   - Tool call: `task_create({ title: "Call the plumber" })`
   - **Expected:** `{ task_id: 1, title: "Call the plumber", assignee: "Lee", status: "open", priority: "normal" }`
   - **Expected:** No Signal notification (self-assigned)

### task_create — assign to another person
2. As Lee: "Ask Steve to pick up the dry cleaning by Friday"
   - Tool call: `task_create({ title: "Pick up dry cleaning", assignee_id: "steve", due_at: "<friday ISO>" })`
   - **Expected:** Task created with assignee_id = "steve"
   - **Expected:** Signal notification sent to Steve: "📋 New task from Lee: Pick up dry cleaning"

### task_create — assign by display name
3. As Lee: `task_create({ title: "Test task", assignee_id: "Kelly" })`
   - **Expected:** Resolves "Kelly" to "kelly", task assigned correctly

### task_create — with priority and due date
4. As Lee: `task_create({ title: "File taxes", priority: "urgent", due_at: "2026-03-15T17:00:00-07:00" })`
   - **Expected:** Task created with priority "urgent" and due_at formatted in Pacific

### task_create — permission denied for cross-person (child)
5. As Ryker: `task_create({ title: "Clean room", assignee_id: "steve" })`
   - **Expected:** Permission denied (Ryker has `tasks` but not `tasks_others`)

### task_create — self-assign works for child
6. As Ryker: `task_create({ title: "Do homework" })`
   - **Expected:** Task created, assigned to Ryker

### task_query — default (my active tasks)
7. As Lee (with tasks from above): `task_query({})`
   - **Expected:** Returns Lee's open/in_progress tasks, sorted by overdue first, then priority, then created_at

### task_query — tasks I assigned to others
8. As Lee: `task_query({ creator_id: "me", assignee_id: "steve" })`
   - **Expected:** Returns Steve's task that Lee created

### task_query — overdue only
9. Create a task with due_at in the past, then: `task_query({ include_overdue_only: true })`
   - **Expected:** Only returns the overdue task

### task_query — filter by status
10. As Lee: `task_query({ status: "done" })`
    - **Expected:** Returns completed tasks (empty if none completed yet)

### task_query — permission denied for viewing others (child)
11. As Ryker: `task_query({ assignee_id: "steve" })`
    - **Expected:** Permission denied

### task_update — mark done (self)
12. As Lee: `task_update({ task_id: 1, status: "done" })`
    - **Expected:** Task status → "done", completed_at set
    - **Expected:** No notification (self-assigned, creator = assignee)

### task_update — mark done (cross-person)
13. As Steve: `task_update({ task_id: 2, status: "done" })` (the dry cleaning task from Lee)
    - **Expected:** Task status → "done"
    - **Expected:** Signal notification to Lee: "✅ Steve completed: Pick up dry cleaning"

### task_update — change status to in_progress
14. `task_update({ task_id: <id>, status: "in_progress" })`
    - **Expected:** Status updated, updated_at changed

### task_update — cancel with notification
15. As Steve: `task_update({ task_id: <id>, status: "cancelled" })` on a task Lee created
    - **Expected:** Signal notification to Lee: "🚫 Steve cancelled task: ..."

### task_update — reassign
16. As Lee: `task_update({ task_id: <id>, assignee_id: "kelly" })`
    - **Expected:** Assignee changed, Signal notification to Kelly: "📋 Task reassigned to you..."

### task_update — change priority
17. `task_update({ task_id: <id>, priority: "high" })`
    - **Expected:** Priority updated

### task_update — change due date
18. `task_update({ task_id: <id>, due_at: "<new ISO>" })`
    - **Expected:** Due date updated

### task_update — no fields provided
19. `task_update({ task_id: 1 })`
    - **Expected:** Error: at least one field to update is required

### task_update — task not found
20. `task_update({ task_id: 99999, status: "done" })`
    - **Expected:** Error: task not found

### task_update — permission: can't update someone else's task without tasks_others
21. As Ryker: `task_update({ task_id: <lee's task>, status: "done" })`
    - **Expected:** Permission denied

## Integration

### Morning briefing includes tasks
22. Create an overdue task assigned to Lee. Trigger morning briefing cycle. Verify the briefing prompt includes tasks context (check logs for the prompt or the resulting briefing message).

## Shared Utility

### resolve-member.js
23. Verify `resolveMemberId("Lee", null)` → "lee"
24. Verify `resolveMemberId("me", "steve")` → "steve"
25. Verify `resolveMemberId("nobody", null)` → null

## Regression

26. `npm test` passes
27. Existing reminder tools still work (no changes to reminder files)
28. Morning briefing still fires for subscribed members
29. No changes to files outside spec scope
