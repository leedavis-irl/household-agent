# Anticipatory daily operations

**Sphere:** Scheduling & Logistics
**Backlog item:** Anticipatory daily operations
**Depends on:** calendar_query, weather_query, knowledge_search, reminder_list tools

## What to build

Let Iji proactively send context-aware nudges throughout the day — not just the morning briefing, but timely alerts like 'Rain starting at 3pm, Ryker needs a jacket for pickup' or 'Kelly's meeting moved to 2pm, you might want to adjust the carpool.' Event-driven rather than scheduled.

## Context

Morning briefing (src/utils/morning-briefing.js) already runs a daily check. This extends the pattern to multiple daily touchpoints triggered by context changes. Calendar, weather, and knowledge tools already exist.

## Implementation notes

Create `src/utils/daily-ops.js` with a check cycle that runs every 30 minutes during waking hours (7am-10pm Pacific). Each cycle: check for weather changes, upcoming calendar events within 2 hours, overdue tasks, and relevant knowledge updates. Only send a nudge if there's something actionable and new (dedup against a sent-today log). Route via Signal DM to the relevant person.

## Server requirements

- [ ] No new env vars needed

## Verification

- Verify the scheduler runs during waking hours and stays silent overnight
- If a calendar event is in 2 hours, verify a reminder would be sent
- If weather changes significantly, verify a nudge would be sent
- Ask Iji: "What should I know about today?" → Triggers an on-demand daily ops check

## Done when

- [ ] Daily ops checker runs every 30 minutes during 7am-10pm Pacific
- [ ] Context-aware nudges sent for weather, calendar, tasks
- [ ] Dedup prevents repeat nudges for same event
- [ ] On-demand query via conversation
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Anticipatory daily operations" "In Review"
```

## Commit message

`feat: add anticipatory daily operations with proactive nudges`
