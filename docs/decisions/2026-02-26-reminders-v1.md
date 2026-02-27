# Decision: Reminders v1

**Date:** 2026-02-26
**Status:** Accepted
**Decider:** Lee (with Claude as advisor)

## Context

Iji is purely reactive — it only does things when someone messages it. The household needs the ability to say "remind me to X at Y time" and have Iji follow through. This is also the first proactive behavior, creating the scheduler infrastructure that morning briefings, conflict alerts, and other time-triggered features will build on.

## Decision

Build time-based reminders with set/list/update tools, a 60-second scheduler loop, and follow-up cycling until completed or snoozed.

### Key design choices:

1. **Set for self and others.** Adults can remind anyone. Kids can only remind themselves.
2. **Follow-up after 30 minutes.** Iji checks in. Person can say "done" (deletes reminder) or "push to 5pm" (snoozes). Max 3 follow-ups, then Iji stops asking and snoozes it.
3. **Creator gets notified.** When you set a reminder for someone else, you're told when it's delivered and when they complete/cancel it.
4. **Completed reminders are deleted.** Table only holds active work. No historical record needed for v1.
5. **No location-based, no recurring.** Time-based only. Location and recurring are future iterations.
6. **Scheduler is the primitive.** The same 60-second loop pattern will be reused for morning briefings and proactive alerts.

## Consequences

- Iji gains its first proactive behavior (initiates contact on a timer)
- New infrastructure: scheduler loop in main process, fired-reminder context injection in prompt
- Prerequisite for morning briefings (Bundle A, Phase 2)
- New permission type: `reminders` / `reminders_others`

## Spec

`specs/REMINDERS-V1.md`
