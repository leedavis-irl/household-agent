# Escalation intelligence

**Sphere:** Engine
**Backlog item:** Escalation intelligence
**Depends on:** conversation_evals table

## What to build

Teach Iji to recognize when it's out of its depth and should escalate to Lee rather than guessing. Learn from past conversations where Iji gave bad answers or where Lee corrected it. Build an evolving boundary of what Iji should and shouldn't attempt autonomously.

## Context

conversation_evals table stores past interactions with quality_score and failure_category columns. The goal is a feedback loop: when Iji is corrected, it logs the topic/pattern as an escalation trigger. Future similar requests get flagged early.

## Implementation notes

Add an `escalation_patterns` table via DB migration (pattern, category, reason, created_at). Create `src/tools/escalation-log.js` that lets Lee add escalation rules ('don't try to give tax advice, suggest calling Peter at Goldman Sachs'). Modify the core prompt to instruct Claude to check escalation patterns before attempting complex tasks.

## Server requirements

- [ ] DB migration runs automatically

## Verification

- Lee tells Iji: "Don't try to answer legal questions, tell people to ask me" → Logged as escalation rule
- Someone asks a legal question → Iji defers to Lee instead of guessing
- Ask Iji: "What topics do you escalate?" → Lists escalation rules

## Done when

- [ ] `escalation_patterns` table created
- [ ] `escalation_log` tool for adding/viewing rules
- [ ] Core prompt checks patterns before complex answers
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Escalation intelligence" "In Review"
```

## Commit message

`feat: add escalation intelligence with learnable boundaries`
