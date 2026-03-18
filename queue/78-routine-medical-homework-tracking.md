# Routine, medical & homework tracking

**Sphere:** Children
**Backlog item:** AM/PM routine tracking, Medical/permission-slip tracking, Homework tracking support
**Depends on:** child_schedule (queue #77), reminder_set, knowledge_store

## What to build

Three related child-management capabilities bundled as one card:

1. **Routine tracking** — Morning and evening routines for each child (did they brush teeth, pack lunch, do reading?). Adults or kids can check off items via Iji. Iji can report "Logan hasn't checked off homework yet."
2. **Medical/permission tracking** — Store upcoming medical appointments, permission slip deadlines, medication schedules. Proactive reminders before deadlines.
3. **Homework tracking** — Simple log of homework assignments with due dates. Kids or adults can add entries; Iji reminds about upcoming due items.

## Context

Reminder tools exist for scheduling alerts. Knowledge store can persist structured data. The local SQLite database (`src/utils/db.js`) may be a better fit than the knowledge base for structured records with dates. Education Advisor has child profiles but not daily operational data.

## Implementation notes

Create `src/tools/child-routines.js` for routine checklists (stored in SQLite with daily reset). Create `src/tools/child-tracking.js` for medical/permission/homework entries (stored in SQLite with due dates). Both tools should support: add, query, check-off/complete. Integrate with reminders for proactive nudges. Consider a daily briefing hook that includes "unchecked routine items" and "upcoming homework due."

## Server requirements

- [ ] SQLite migration for `child_routines` and `child_tracking` tables
- [ ] Ensure HA/ESPHome integration exists if physical routine buttons are desired (optional, deferred)

## Verification

- Ask Iji: "Add homework for Ryker: math worksheet due Friday" → Creates tracking entry
- Ask Iji: "Did Logan do his morning routine?" → Shows checklist status
- Ask Iji: "Hazel has a dentist appointment March 25" → Creates medical entry with reminder

## Done when

- [ ] Routine checklists work (add, query, check-off, daily reset)
- [ ] Medical/permission/homework tracking works (add, query, complete)
- [ ] Automatic reminders for due items
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Routine, medical & homework tracking" "In Review"
```

## Commit message

`feat: add child routine, medical, and homework tracking tools`
