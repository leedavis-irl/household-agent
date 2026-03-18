# Scene/automation triggers

**Sphere:** Property & Home
**Backlog item:** Scene/automation triggers
**Depends on:** ha_scene tool (already built)

## What to build

The ha_scene tool was already built and deployed in this session. This card should be moved to Done.

## Context

ha_scene was implemented in src/tools/ha-scene.js, registered in index.js, and deployed to EC2. See commit 'feat: add ha_history, ha_scene, and ha_notify tools'.

## Implementation notes

No work needed — already complete. Update card status to Done.

## Server requirements

- [ ] Already deployed

## Verification

- ha_scene tool exists in src/tools/ha-scene.js
- Registered in src/tools/index.js
- Permission-gated in src/utils/permissions.js

## Done when

- [x] Already complete — move card to Done

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Scene/automation triggers" "In Review"
```

## Commit message

`n/a — already shipped`
