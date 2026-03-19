# OpenClaw Automation — Operational Runbook

## What it does

The OpenClaw watcher polls GitHub Project #2 every 30 minutes during work hours (9am–6pm Pacific) for cards moved to "Ready". When detected, it:

1. Finds the matching queue spec file (via the card's Spec field or fuzzy title match)
2. **Validates spec quality** — rejects stubs with insufficient detail and moves them back to Backlog
3. Moves the card to "In progress"
4. Invokes Claude Code with the spec
5. Reviews the resulting diff (baseline→HEAD, up to 15K chars + file list) against the spec's "Done when" criteria
6. On pass: pushes, deletes the queue file, moves card to "Done", notifies Lee
7. On fail: retries up to 3 times **with reviewer feedback passed to the next attempt**, then moves card back to Ready and escalates to Lee

## Starting the watcher

```bash
# From the household-agent repo root on Lee's Mac Mini
node scripts/openclaw-watcher.js

# Or run in background with logging
node scripts/openclaw-watcher.js >> /tmp/openclaw-watcher.log 2>&1 &
```

### As a launchd service (survives restarts)

Create `~/Library/LaunchAgents/com.openclaw.watcher.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.watcher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/openclaw/household-agent/scripts/openclaw-watcher.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/openclaw/household-agent</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/openclaw-watcher.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openclaw-watcher-error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>ANTHROPIC_API_KEY</key>
    <string>SET_THIS</string>
  </dict>
</dict>
</plist>
```

```bash
# Load the service
launchctl load ~/Library/LaunchAgents/com.openclaw.watcher.plist

# Check status
launchctl list | grep openclaw

# Stop it
launchctl unload ~/Library/LaunchAgents/com.openclaw.watcher.plist
```

## Stopping the watcher

```bash
# If running in foreground: Ctrl+C
# If running in background:
pkill -f openclaw-watcher

# If running as launchd service:
launchctl unload ~/Library/LaunchAgents/com.openclaw.watcher.plist
```

## Monitoring

```bash
# Watch the log
tail -f /tmp/openclaw-watcher.log

# Check if running
pgrep -f openclaw-watcher
```

## How to trigger a build

1. Go to GitHub Project #2: https://github.com/users/leedavis-irl/projects/2
2. Move a card from "Spec'd" to "Ready" (only cards with complete specs should be in Spec'd)
3. Wait up to 30 minutes for the next poll cycle
4. Watch the log for progress

## Manual card status updates

The `gh-update-card.sh` helper can update any card:

```bash
./scripts/gh-update-card.sh "Card Title" "Backlog"      # Return to backlog
./scripts/gh-update-card.sh "Card Title" "Specd"        # Spec reviewed, safe to move to Ready
./scripts/gh-update-card.sh "Card Title" "Ready"        # Queue for watcher to pick up
./scripts/gh-update-card.sh "Card Title" "In progress"  # Mark as in progress
./scripts/gh-update-card.sh "Card Title" "In review"    # Mark for review
./scripts/gh-update-card.sh "Card Title" "Done"         # Mark complete
./scripts/gh-update-card.sh "Card Title" "Abandoned"    # Dropped
```

## Requirements

- `gh` CLI authenticated with `read:project` and `project` scopes
- `claude` CLI installed and authenticated
- `ANTHROPIC_API_KEY` env var set (for the review step)
- SSH key at `~/.ssh/the-pem-key.pem` (for Signal notifications to Lee)
- Node.js 18+

## Troubleshooting

**"Spec failed quality check"** — The spec didn't meet minimum requirements (15+ words in "What to build", 20+ words in "Implementation notes", 3+ "Done when" items, non-placeholder verification, no boilerplate patterns). Card is moved back to Backlog with feedback. Fix the spec before moving to Ready again.

**"No spec file found"** — The card's Spec field is empty or the queue file doesn't exist. Set the Spec field to the queue file path (e.g., `queue/28-email-draft.md`).

**"Claude Code failed"** — Check the watcher log for error details. Common causes: missing permissions, API rate limits, network issues.

**"Review failed after 3 attempts"** — The automated review couldn't verify the done-when criteria were met. Card is moved back to Ready. Lee gets a Signal notification. Manually review the diff and either move to Done or add feedback.

**Watcher not polling** — Check if the process is running (`pgrep -f openclaw-watcher`). Check the log for errors. Verify `gh auth status` passes.

## Card lifecycle

```
Backlog → Spec'd → Ready → In Progress → In Review → Done
                                    ↓              ↓
                              (CC crash)    (review fail ×3)
                                    ↓              ↓
                                 Ready ←──────── Ready
```

- **Backlog**: Idea exists, spec may be incomplete or a stub
- **Spec'd**: Spec passes quality validation, safe to move to Ready at any time
- **Ready**: Watcher will pick this up on the next poll (30min during 9am–6pm Pacific)
- **In Progress**: CC is actively working
- **In Review**: CC finished, automated reviewer is checking the diff
- **Done**: Shipped, review passed, queue file deleted
- **Abandoned**: Dropped
