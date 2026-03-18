# HA notification dispatch

**Sphere:** Property & Home
**Backlog item:** HA notification dispatch
**Depends on:** ha_notify tool (already built)

## What to build

The ha_notify tool was already built and deployed in this session. This card should be moved to Done.

## Context

ha_notify was implemented in src/tools/ha-notify.js, registered in index.js, and deployed to EC2. See commit 'feat: add ha_history, ha_scene, and ha_notify tools'.

## Implementation notes

No work needed — already complete. Update card status to Done.

## Server requirements

- [ ] Already deployed

## Verification

- ha_notify tool exists in src/tools/ha-notify.js
- Registered in src/tools/index.js
- Permission-gated in src/utils/permissions.js

## Done when

- [x] Already complete — move card to Done

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "HA notification dispatch" "In Review"
```

## Commit message

`n/a — already shipped`
