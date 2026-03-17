# Iji Build Queue

This folder is the work queue. Items here are ready to execute — no design work needed, no human required to initiate. Claude Code (and eventually OpenClaw) picks up the lowest-numbered item, builds it, verifies it, and commits.

## How it works

1. Pick up the lowest-numbered file. Read it. Build it. Verify it. Commit.
2. Delete the file from `queue/` when done.
3. If you hit a blocker that requires a human decision, stop and report via Slack (tag Lee).

## What "queue-ready" means

Every spec here is self-contained:
- What to build and why
- Which files to read before starting
- What done looks like
- How to verify without asking anyone

If you have to ask a clarifying question, the spec isn't ready — flag it and move to the next item.

## Adding items

Items come from BACKLOG.md. They are written by Claude (Engineer) during design sessions with Lee. Do not self-generate queue items.

## Conventions

- Filename: `NN-short-name.md` (e.g. `01-health-check-cron.md`)
- One file per work item
- Delete the file when the work is done and committed
