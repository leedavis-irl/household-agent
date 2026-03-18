# School/activity schedule assistant

**Sphere:** Children
**Backlog item:** School/activity schedule assistant
**Depends on:** calendar_query, calendar_create, reminder_set

## What to build

A tool that lets household adults ask Iji about children's school schedules, extracurricular activities, and upcoming events. Iji should be able to answer "When does Ryker have soccer?" or "What's Logan's schedule this week?" by querying calendar events tagged to each child, and create/modify schedule entries. Should also support proactive reminders for pickup times, early dismissals, and activity changes.

## Context

Calendar tools already exist (`src/tools/calendar.js`, `calendar-create.js`, `calendar-modify.js`). Reminder tools exist (`src/tools/reminder-*.js`). Education tools provide child profiles via Supabase. The Google Calendar integration uses per-person calendar IDs from `config/household.json`. Children's schedules likely live on shared household calendars.

## Implementation notes

Create `src/tools/child-schedule.js` that: (1) wraps `calendar_query` with child-specific filtering (search by child name in event title/description), (2) returns a structured view of the child's week, (3) supports creating recurring schedule entries (e.g., "Soccer every Tuesday 4-5pm"). Consider adding a `children_schedules` section to `config/household.json` mapping each child to their relevant calendar IDs and activity keywords.

## Server requirements

- [ ] Verify children's events are on calendars accessible via existing Google Calendar OAuth tokens
- [ ] Add `children_schedules` config section to `config/household.json` if needed

## Verification

- Ask Iji: "What does Ryker have this week?" → Returns schedule from calendar
- Ask Iji: "Add soccer practice for Logan, Tuesdays 4-5pm" → Creates recurring calendar event
- Ask Iji: "Remind me 30 min before Hazel's pickup" → Sets reminder linked to calendar event

## Done when

- [ ] `child_schedule` tool queries calendar events filtered by child
- [ ] Can create/modify child schedule entries
- [ ] Integrates with reminder system for proactive alerts
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "School/activity schedule assistant" "In Review"
```

## Commit message

`feat: add child schedule assistant tool with calendar integration`
