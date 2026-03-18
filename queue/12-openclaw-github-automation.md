# OpenClaw: GitHub Project Automation & Queue Watcher

**Sphere:** Engine
**Backlog item:** OpenClaw GitHub Project automation
**Depends on:** gh CLI authenticated, GitHub Project #2 set up, queue/ folder exists

## What to build

Two connected automations that remove Lee from the middle of the development loop. A polling watcher detects cards moved to "Ready" in GitHub Project #2, invokes Claude Code to build the matching queue spec, reviews the diff against the spec's "Done when" criteria, and moves the card to "Done" or retries with feedback. Lee gets a Signal notification on completion or failure.

## Context

The watcher runs as a long-lived process on the Mac Mini via launchd. Queue specs live in `queue/*.md` and follow the format in `queue/TEMPLATE.md`. Each spec has a "Done when" section with checkable criteria that the automated reviewer evaluates against the actual diff.

Key files:
- Queue template: `queue/TEMPLATE.md`
- GitHub Project IDs: hardcoded in the watcher (project, status field, status option IDs)
- Anthropic API: used for the review step (claude-sonnet-4-20250514 evaluates diff vs. done-when criteria)
- Signal notification: sends via SSH to EC2 → signal-cli

## Implementation notes

### Part 1: Polling watcher script

Create `scripts/openclaw-watcher.js` (Node.js, long-running):

- Poll GitHub Project #2 every 30 minutes (9am–6pm Pacific only) for items with Status = "Ready"
- Track "already processing" card IDs in memory to avoid double-processing
- For each new Ready card:
  1. Find matching queue file (Spec field, or fuzzy match title to filename)
  2. Update card to "In Progress"
  3. Spawn Claude Code: `claude --dangerously-skip-permissions -p [prompt]`
  4. On completion, trigger review

### Part 2: Review and status update

After CC completes:
1. Diff from baseline SHA to HEAD (captures all commits CC made)
2. Extract "Done when" section from the spec
3. Use Anthropic API to evaluate: does the diff satisfy the criteria?
4. If pass: push to origin, delete queue file, move card to "Done", notify Lee via Signal
5. If fail: re-invoke CC with feedback (max 3 attempts before moving back to Ready and escalating)

### Part 3: CC status updater

Create `scripts/gh-update-card.sh` — a helper CC can call to update its own card status:
```bash
# Usage: ./scripts/gh-update-card.sh "Card Title" "In Review"
```

## Server requirements

- `GITHUB_TOKEN` — for gh CLI (already configured via `gh auth`)
- `ANTHROPIC_API_KEY` — for review step (already in `.env`)
- SSH access to EC2 for Signal notifications
- launchd plist at `~/Library/LaunchAgents/com.openclaw.watcher.plist` for persistence across restarts

## Verification

- Move a test card to "Ready" in GitHub Project #2 — confirm the watcher picks it up within one poll cycle
- Confirm CC is invoked and the card progresses through In Progress → In Review → Done
- Confirm Lee receives a Signal notification on completion
- Confirm a failed review retries with feedback (up to 3 attempts)
- Confirm the watcher survives a `launchctl unload` / `launchctl load` cycle

## Done when

- [ ] `scripts/openclaw-watcher.js` runs and polls Project #2 every 30 minutes during work hours
- [ ] Moving a card to "Ready" triggers CC invocation automatically
- [ ] CC completes work and review passes → card moves to "Done"
- [ ] Failed review retries with feedback (max 3 attempts, then escalates)
- [ ] Lee receives Signal notification on completion or failure
- [ ] Watcher persists via launchd
- [ ] `scripts/gh-update-card.sh` works for CC to update its own card
- [ ] `docs/ops/openclaw-automation.md` documents start/stop/monitor
- [ ] Committed

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "OpenClaw: GitHub Project Automation & Queue Watcher" "In Review"
```

## Commit message

`feat: add OpenClaw GitHub Project automation and queue watcher`
