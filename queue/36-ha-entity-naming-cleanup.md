# HA entity naming cleanup

**Sphere:** Property & Home
**Backlog item:** HA entity naming cleanup
**Depends on:** Home Assistant admin access

## What to build

Fix entity_id and friendly_name mismatches in Home Assistant and Hue. Key offenders: light.logan_bedside_lamp → 'Living Room Floor Lamp 1', basement entities still named 'train station', Hallie's office mislabeled, generic Hue bulbs in Logan's closet, null-named WiZ bulbs in foyer.

## Context

BACKLOG.md section 15 lists specific offenders. Fixes are in HA entity registry and/or Hue app directly — not in Iji code. This is an ops task, not a code task. Iji's area registry is the source of truth, but confusing names affect humans browsing HA.

## Implementation notes

This is a manual HA admin task, not code. Document the fix plan in `docs/ops/ha-entity-cleanup.md` with: (1) list of entities to rename, (2) which to fix in HA vs Hue app, (3) verification steps. Iji code changes: none needed.

## Server requirements

- [ ] HA entity registry edits (manual via HA UI)
- [ ] Hue app name changes (manual via Hue app)

## Verification

- Check HA entity list → All friendly_names match their actual room/function
- Ask Iji: "What lights are in the living room?" → Returns correctly named entities
- No more generic or mismatched names in HA UI

## Done when

- [ ] Ops runbook created at docs/ops/ha-entity-cleanup.md
- [ ] All listed entity mismatches resolved
- [ ] HA UI shows correct names

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "HA entity naming cleanup" "In Review"
```

## Commit message

`docs: add HA entity naming cleanup runbook`
