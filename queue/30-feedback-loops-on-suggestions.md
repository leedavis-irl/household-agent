# Feedback loops on suggestions

**Sphere:** Engine
**Backlog item:** Feedback loops on suggestions
**Depends on:** knowledge_store, conversation_evals

## What to build

When Iji makes suggestions (restaurants, activities, products), track whether the household liked or disliked the outcome. Over time, improve recommendations based on accumulated feedback.

## Context

Knowledge store can persist feedback. The key is a structured feedback mechanism: after Iji suggests something, it can later ask 'how did that work out?' or the user can volunteer feedback. Store as tagged knowledge entries.

## Implementation notes

Create `src/tools/feedback-log.js` with `record` action (log feedback on a past suggestion: topic, rating 1-5, notes) and `query` action (retrieve feedback by topic). Tag entries for searchability. Update the core prompt to instruct Claude to reference past feedback when making similar suggestions.

## Server requirements

- [ ] No new env vars or migrations needed (uses knowledge table with tags)

## Verification

- Ask Iji: "That restaurant you suggested was terrible, 1 star" → Logs feedback
- Ask Iji for restaurant suggestions again → Avoids the poorly-rated one
- Ask Iji: "What feedback have you gotten on restaurant suggestions?" → Lists feedback

## Done when

- [ ] `feedback_log` tool with record and query actions
- [ ] Core prompt instructs Claude to reference feedback
- [ ] Feedback persisted and searchable
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Feedback loops on suggestions" "In Review"
```

## Commit message

`feat: add feedback tracking for Iji suggestions`
