# OpenClaw: Queue Watcher Setup

Set up a queue watcher so that new items in `queue/` are automatically picked up by Claude Code without Lee having to initiate anything.

## What you need to do

1. Watch the directory `~/Projects/Home/household-agent/queue/` for new `.md` files (ignore `README.md` and `TEMPLATE.md`).

2. When a new file appears, invoke Claude Code from `~/Projects/Home/household-agent/` with this instruction:
   > "Read `queue/[filename]` and execute it. Follow DEV-PROTOCOL.md. When done, delete the queue file and commit."

3. After Claude Code finishes, send Lee a Slack DM with either:
   - ✅ `[filename]` done — `[commit message]`
   - 🔧 `[filename]` blocked — `[what it needs from Lee]`

4. Check the queue every 5 minutes, or use a filesystem watcher (whichever is more reliable on your setup).

## Notes

- Only process one queue item at a time — do not run concurrent Claude Code sessions against the same repo.
- If Claude Code exits with an error, report the error to Lee via Slack DM and move on to the next item.
- Do not process items that are already in progress (add a lockfile or in-memory flag).
- The queue currently has 5 items: `01` through `05`. Start with `01`.

## Done when

- Queue watcher is running
- Lee has been notified via Slack DM that the watcher is active
- First queue item (`01-health-check-cron.md`) has been picked up automatically
