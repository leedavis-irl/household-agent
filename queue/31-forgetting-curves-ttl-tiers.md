# Forgetting curves / TTL tiers

**Sphere:** Engine
**Backlog item:** Forgetting curves / TTL tiers
**Depends on:** knowledge table

## What to build

Add time-to-live tiers to household knowledge so ephemeral facts expire automatically. A dinner reservation next week should auto-expire after the date. A child's school assignment should expire at end of semester. Permanent facts (house rules, allergies) never expire.

## Context

Knowledge table already has an `expires_at` column but it's rarely used. The knowledge_store tool doesn't prompt for expiry. The scheduler pattern (src/scheduler/reminders.js) shows how to run periodic cleanup.

## Implementation notes

Add TTL tier logic to `src/tools/knowledge-store.js`: when storing knowledge, Claude should classify the TTL tier (ephemeral: 1 week, short: 1 month, medium: 6 months, permanent: no expiry) and set expires_at accordingly. Create a cleanup job in a new scheduler that runs daily and deletes expired knowledge entries. Update the prompt to instruct Claude to set appropriate TTL tiers.

## Server requirements

- [ ] No new env vars needed

## Verification

- Tell Iji: "We have dinner at Chez Panisse on Friday" → Stored with ~1 week TTL
- Tell Iji: "Ryker is allergic to peanuts" → Stored with permanent TTL
- Verify expired entries are cleaned up on the next daily run

## Done when

- [ ] Knowledge store sets TTL tiers based on content type
- [ ] Daily cleanup job removes expired entries
- [ ] Permanent facts never expire
- [ ] Prompt instructs Claude on TTL classification
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Forgetting curves / TTL tiers" "In Review"
```

## Commit message

`feat: add TTL tiers and auto-expiry for household knowledge`
