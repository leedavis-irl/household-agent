# Confidence calibration

**Sphere:** Engine
**Backlog item:** Confidence calibration
**Depends on:** conversation_evals table, eval-logger.js

## What to build

Add staleness-aware confidence signals to Iji's responses. When answering from knowledge that may be outdated (old calendar events, knowledge base entries with no recent updates, stale sensor data), Iji should explicitly flag the confidence level and data freshness.

## Context

The knowledge table has `reported_at` timestamps. Calendar events have dates. HA entities have `last_changed`. The eval logger (src/utils/eval-logger.js) already tracks conversation quality. The key change is in the system prompt — instruct Claude to assess and communicate data freshness.

## Implementation notes

Update `config/prompts/core.md` to add a 'Confidence & Freshness' guideline section instructing Claude to: (1) note when knowledge base entries are > 7 days old, (2) flag calendar data that might be stale, (3) indicate when HA sensor data hasn't updated recently. No new tool needed — this is a prompt engineering change with optional metadata enrichment in tool responses.

## Server requirements

- [ ] No new env vars needed

## Verification

- Ask about old knowledge → Iji flags it as potentially outdated
- Ask about a calendar event from last month → Iji notes the data age
- Ask about current home state → Iji uses fresh data confidently

## Done when

- [ ] Core prompt updated with confidence/freshness guidelines
- [ ] Tool responses include data age metadata where applicable
- [ ] Iji demonstrates appropriate confidence calibration in conversation
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Confidence calibration" "In Review"
```

## Commit message

`feat: add confidence calibration and data freshness signals to prompt`
