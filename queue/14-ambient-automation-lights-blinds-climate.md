# Ambient automation (lights/blinds/climate)

**Sphere:** Property & Home
**Backlog item:** Ambient automation (lights/blinds/climate)
**Depends on:** ha_control, ha_query, ha_scene tools

## What to build

Enable Iji to proactively suggest and execute ambient automation — adjusting lights, blinds, and climate based on time of day, who's home, and context. Unlike the failed claude-home-agent (AppDaemon), this must use event batching, cost ceilings, action memory, and opt-in scope to avoid feedback loops and runaway API costs.

## Context

Previous attempt at ~/Projects/Home/claude-home-agent/ was disabled due to stateless oscillation and runaway costs. HA tools already exist (ha_query, ha_control, ha_scene). The key innovation is a lightweight state machine that prevents repeated actions and respects a per-hour cost ceiling. Read src/tools/ha-control.js for the existing pattern.

## Implementation notes

Create `src/tools/ambient-automation.js` with a `suggest_automation` action (proposes changes, waits for approval) and an `apply_automation` action (executes approved changes). Maintain an in-memory action log to prevent oscillation (e.g., don't toggle the same light twice in 10 minutes). Add a cost counter that caps API calls per hour. Start with lights-only scope; blinds and climate can be added later.

## Server requirements

- [ ] No new env vars needed (uses existing HA_URL and HA_TOKEN)

## Verification

- Ask Iji: "It's movie night, dim the living room" → Suggests specific light changes, applies on confirmation
- Send two identical requests within 5 minutes → Second request is suppressed with explanation
- Ask Iji: "What automations have you run today?" → Returns action log

## Done when

- [ ] Ambient automation tool with suggest/apply actions
- [ ] Oscillation prevention (action dedup within time window)
- [ ] Cost ceiling per hour
- [ ] Lights scope working; blinds/climate scoped out for v1
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Ambient automation (lights/blinds/climate)" "In Review"
```

## Commit message

`feat: add ambient automation with oscillation prevention`
