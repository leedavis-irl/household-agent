# Grounds/landscape task tracking

**Sphere:** Property & Home
**Backlog item:** Grounds/landscape task tracking
**Depends on:** knowledge_store, reminder_set tools

## What to build

Track landscaping and grounds maintenance tasks — mowing schedule, tree trimming, irrigation, seasonal planting. Linked to maintenance operations with reminders for recurring tasks.

## Context

Maintenance/property is Department 8. Knowledge and reminder tools provide the foundation. This is a lightweight task list specific to grounds work, with seasonal recurrence patterns.

## Implementation notes

Use the existing task system (src/tools/task-create.js, task-query.js) with a 'grounds' category/tag convention rather than building a separate system. Add landscaping context to knowledge base. Create recurring reminders for seasonal tasks. Update the capability prompt to mention grounds tracking.

## Server requirements

- [ ] No new env vars needed

## Verification

- Ask Iji: "Schedule lawn mowing every two weeks" → Creates recurring reminder
- Ask Iji: "What grounds work is coming up?" → Lists upcoming landscaping tasks
- Ask Iji: "Log that we trimmed the oak tree today" → Stores in knowledge base

## Done when

- [ ] Grounds tasks tracked via existing task/reminder/knowledge systems
- [ ] Seasonal recurrence patterns supported
- [ ] Capability prompt updated
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Grounds/landscape task tracking" "In Review"
```

## Commit message

`feat: add grounds and landscape task tracking`
