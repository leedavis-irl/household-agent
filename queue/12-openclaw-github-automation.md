# OpenClaw: GitHub Project Automation & Queue Watcher

**Sphere:** Engine
**Project:** Iji
**Depends on:** gh CLI authenticated, GitHub Project #2 set up, queue/ folder exists

## What to build

Two connected automations that remove Lee from the middle of the development loop:

1. **GitHub Project watcher** — polls Project #2 every 5 minutes for cards moved to "Ready". When detected, finds the corresponding queue file and invokes Claude Code on it.
2. **Status updater** — Claude Code moves its card to "In Progress" when it starts, "In Review" when it commits. OpenClaw reviews the diff against the spec and moves to "Done" or back to "In Progress" with feedback.

## The full flow

1. Lee moves a card to **Ready** in GitHub Project #2
2. OpenClaw detects the status change (polling loop)
3. OpenClaw finds the matching queue file in queue/ by matching card title to filename
4. OpenClaw invokes Claude Code: `claude --dangerously-skip-permissions` with the queue prompt
5. Claude Code reads the spec, builds it, commits, then updates the card to **In Review** via gh api graphql
6. OpenClaw reads the git diff of the commit
7. OpenClaw checks the diff against the spec's "Done when" criteria
8. If passes → OpenClaw moves card to **Done**, DMs Lee in Slack: "✅ [card title] is done — [commit message]"
9. If fails → OpenClaw moves card back to **In Progress**, messages Claude Code with specific feedback, CC fixes and recommits, loop repeats from step 6

## Implementation

### Part 1: Polling watcher script

Create `scripts/openclaw-watcher.js` (Node.js, runs as a long-running process):

- Every 5 minutes, query GitHub Project #2 for all items with Status = "Ready"
- Compare against an in-memory set of "already processing" card IDs to avoid double-processing
- For each new Ready card:
  1. Extract the card title
  2. Find matching queue file (fuzzy match title to filename, e.g. "Morning Briefing Opt-In/Out" → "04-morning-briefing-opt-in-out.md")
  3. Update card status to "In Progress" via gh api graphql
  4. Spawn Claude Code: `claude --dangerously-skip-permissions` with prompt to work that specific queue file
  5. Watch for CC completion (process exit)
  6. On CC exit, trigger the review step (Part 2)

### Part 2: Review and status update

After CC completes:
1. Get the latest commit hash and diff: `git log -1` and `git diff HEAD~1 HEAD`
2. Read the spec file's "Done when" section
3. Use the Anthropic API (claude-sonnet-4-20250514) to evaluate: does the diff satisfy the "Done when" criteria?
4. If yes:
   - Update card to "Done" via gh api graphql
   - Delete the queue file if CC didn't already
   - DM Lee in Slack: "✅ [title] shipped — [commit message]"
5. If no:
   - Update card back to "In Progress"
   - Re-invoke CC with specific feedback about what's missing
   - Repeat review loop (max 3 attempts before escalating to Lee)

### Part 3: CC status updates

Add a small helper script `scripts/gh-update-card.sh` that CC can call to update its own card status:

```bash
#!/bin/bash
# Usage: ./scripts/gh-update-card.sh "Card Title" "In Review"
# Updates the matching card in GitHub Project #2 to the given status
```

Each queue spec should end with: "When done, run `./scripts/gh-update-card.sh '[card title]' 'In Review'` before committing."

## Environment variables needed

- `GITHUB_TOKEN` — for gh CLI (already configured if gh auth status passes)
- `ANTHROPIC_API_KEY` — for review step (already in .env)
- `SLACK_BOT_TOKEN` — for DMs to Lee (already configured)
- `SLACK_LEE_USER_ID` — Lee's Slack user ID for DMs

## Files to create

- `scripts/openclaw-watcher.js` — main polling loop
- `scripts/gh-update-card.sh` — card status updater for CC to call
- `docs/ops/openclaw-automation.md` — operational runbook

## Starting the watcher

Add to OpenClaw's startup instructions:
```
node ~/Projects/Home/household-agent/scripts/openclaw-watcher.js &
```

Or add as a cron job / launchd service on the Mac Mini so it survives restarts.

## Done when

- `scripts/openclaw-watcher.js` runs and polls Project #2 every 5 minutes
- Moving a test card to "Ready" triggers CC invocation automatically
- CC completes work and card moves to "In Review" automatically
- OpenClaw review passes and card moves to "Done" automatically
- Lee receives a Slack DM on completion
- Watcher survives process restarts (launchd or equivalent)
- `docs/ops/openclaw-automation.md` documents how to start/stop/monitor it

## Commit message
`feat: add OpenClaw GitHub Project automation and queue watcher`
