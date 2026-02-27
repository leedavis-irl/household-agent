# ADR: Morning Briefings v1

**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Lee, Claude (Engineer)

## Context

Iji is purely reactive — it only speaks when spoken to. A household Chief of Staff should provide a daily briefing without being asked. This is the second proactive behavior after reminders, and reuses the same scheduler pattern.

A v0 implementation exists (`src/utils/morning-briefing.js`) that was built before the current dev protocol was established. It goes through the full brain loop (Claude composes the briefing using real tools) which is the right approach, but has bugs and missing features that prevent it from working reliably.

## Decision

Upgrade the existing v0 to a production-quality v1 with these changes:

### 1. Fix the timing bug

The v0 checks `hour === BRIEFING_HOUR && minute === 0` on a 60-second interval. This has a ~50% miss rate because the interval may not align with the :00 minute. Replace with a window-based check: track the last date a briefing was sent per person (already done via `sentToday` set) and fire if `hour >= deliveryHour` and not yet sent today. This guarantees delivery even if the process restarts mid-morning.

### 2. Move config to household.json

Per-person briefing configuration in `household.json` instead of env vars:

```json
{
  "lee": {
    "briefing": {
      "enabled": true,
      "delivery_hour": 7
    }
  }
}
```

No `briefing` key = no briefing (opt-out by default). This lets each adult pick their own delivery time and makes the config visible in the repo alongside other per-person settings.

`BRIEFING_ENABLED=false` env var is retained as a global kill switch (useful for dev/testing).

### 3. Claude composes, not templates

Keeping the v0 approach: the briefing is a prompt sent through `think()`. Claude uses its real tools to gather information and composes a natural-language briefing. This means the briefing automatically benefits from any tool improvements without touching briefing code.

### 4. Spec and verification

The v0 was built without a spec. This ADR and the accompanying spec (`specs/MORNING-BRIEFINGS-V1.md`) retroactively document the feature and define v1 acceptance criteria.

## Alternatives Considered

**Template-based briefing (rejected):** Pre-fetch all data and fill a template. Rejected because Claude's composition is better — it can skip empty sections naturally, highlight what matters, and cross-reference (e.g., "you have an outdoor event and it's going to rain").

**Separate scheduler process (rejected):** Run briefings as a cron job or separate service. Rejected because the existing in-process scheduler pattern works, shares the Signal broker and db connection, and adds no operational complexity.

**Per-person delivery minute (deferred):** Allowing `delivery_hour: 7.5` for 7:30am. Deferred to v2 — hour granularity is fine for now and keeps the config simple.

## Consequences

- Adults can receive daily briefings at their preferred hour via Signal DM
- The scheduler becomes slightly more complex (per-person config lookup instead of global env var)
- Briefing cost is ~1 Claude call per person per day (with tool use) — monitor via existing cost telemetry
- Email digest deferred to v2 (requires OAuth token rollout beyond Lee)
