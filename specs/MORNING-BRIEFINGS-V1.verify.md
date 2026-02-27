# Verification: Morning Briefings v1

**Spec:** `specs/MORNING-BRIEFINGS-V1.md`

## Pre-Deploy Checks

- [ ] `household.json` has `briefing` config for Lee and Kelly with `delivery_hour` values
- [ ] `.env.example` updated (removed `BRIEFING_HOUR`, `BRIEFING_RECIPIENTS`; documented `BRIEFING_ENABLED` as global kill switch)
- [ ] No references to `BRIEFING_HOUR` or `BRIEFING_RECIPIENTS` env vars in code (only `BRIEFING_ENABLED`)

## Timing Bug Fix

- [ ] **Restart resilience:** Set `delivery_hour: <current_hour>` temporarily, restart Iji → briefing fires within 60 seconds (because current hour >= delivery hour and not yet sent today)
- [ ] **No double-send:** After receiving briefing, wait 2+ minutes → no second briefing arrives
- [ ] **Future hour:** Set `delivery_hour` to a future hour → no briefing fires (hour check not met)

## Per-Person Config

- [ ] **Lee receives briefing** at configured hour
- [ ] **Kelly receives briefing** at configured hour
- [ ] **Steve does not receive briefing** (no `briefing` key in config)
- [ ] **Member without Signal identifier:** Add `briefing.enabled: true` to a child (no Signal) → log warning, no crash

## Content Quality

- [ ] Briefing mentions today's calendar events (if any exist)
- [ ] Briefing mentions weather (if notable)
- [ ] Briefing mentions pending reminders (if any due today)
- [ ] Briefing does NOT include empty sections ("no reminders today" etc.)
- [ ] Briefing is concise (Signal-appropriate length, not email-length)

## Restart Resilience

- [ ] **Restart after briefing hour:** Restart iji.service after a briefing has already been sent today → no duplicate briefing sent
- [ ] **Restart before briefing hour:** Restart iji.service before delivery_hour → briefing fires normally at the right time

## Regression Checks

- [ ] Reminders scheduler still fires normally (shares index.js startup)
- [ ] Normal Signal messages still work (brain loop not disrupted)
- [ ] `BRIEFING_ENABLED=false` env var disables all briefings (test locally before deploy)

## Cost Check

After first day of briefings:
- [ ] Check `cost_query` — briefing cost per person should be ~$0.01-0.05 per day (one Claude call with tool use)
