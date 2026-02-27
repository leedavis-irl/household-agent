# Verification: HA Area-Based Discovery and Permissions

**Spec:** `docs/specs/bugfix-hue-area-permissions.md`
**Date:** 2025-02-25
**Verified by:** Lee (Product) / Claude (Engineer)

---

## Pre-Deploy Checks (Engineer/Dev)

| Check | Status | Notes |
|-------|--------|-------|
| Code compiles / no lint errors | [x] | Cursor confirmed lint clean |
| Only spec'd files were modified | [x] | Cursor confirmed; BACKLOG.md changes excluded from commit |
| `npm test` passes (if tests exist) | [x] | Import smoke test passes |
| Env vars added to `.env.example` | N/A | No new env vars |
| No secrets in committed code | [x] | No new secrets |

## Server Configuration (Engineer → Product)

| Requirement | Applied? | Notes |
|-------------|----------|-------|
| `ha_areas` added to `config/household.json` | [x] | Deployed via git (part of the commit) |

No new env vars, secrets, or server-side config changes required.

## Functional Tests (Product via Signal)

### Discovery (ha_query)

| ID | Scenario | Message to Send (Signal DM to Iji) | Expected Result | Pass? |
|----|----------|-------------------------------------|-----------------|-------|
| T-01 | List areas | "What rooms do you know about in our house?" | Iji returns a list of ~37 HA areas | [x] |
| T-02 | Area-scoped query | "What lights are in the workshop?" | Returns workshop group + 4 individual cans + Bambu chamber light | [x] |
| T-03 | Area + domain combo | "What sensors are in the living room?" | Returns only sensors in living_room area (not lights) | [x] |
| T-04 | Existing domain query still works | "Show me all locks" | Returns lock entities (existing behavior, no area filter) | [x] | No locks in HA — correct empty result |
| T-05 | Existing entity query still works | "What's the state of light.workshop?" | Returns that specific entity's state | [x] |

### Control — Lee (admin, ha_all)

| ID | Scenario | Message to Send | Expected Result | Pass? |
|----|----------|-----------------|-----------------|-------|
| T-06 | Common area light | "Turn on the living room lights" | `light.living_room` turns on, Iji confirms | [x] |
| T-07 | Basement light (was working) | "Turn off the basement lights" | Still works as before | [x] |
| T-08 | Workshop lights | "Turn on the workshop lights" | `light.workshop` turns on (previously failed for non-basement) | [x] |
| T-09 | Stairwell lights | "Turn on the stairwell lights" | `light.main_stairwell` turns on | [x] | Many individual chandelier bulbs showing unavailable — Hue connectivity issue, not Iji |
| T-10 | Porch lights | "Turn off the porch lights" | `light.porch` turns off | [x] | Multiple individual porch lights showing unavailable — Hue connectivity, not Iji |

### Control — Steve (adult, ha_office + ha_common, NOT ha_all)

These must be tested by Steve via his Signal DM to Iji.

| ID | Scenario | Message to Send | Expected Result | Pass? |
|----|----------|-----------------|-----------------|-------|
| T-11 | Steve controls common area | "Turn on the living room lights" | Works — living_room is common, Steve has ha_common | [ ] |
| T-12 | Steve controls his office | "Turn on my office lights" | Works — steve_s_office is common (all areas are common) | [ ] |
| T-13 | Steve controls workshop | "Turn on the workshop lights" | Works — previously would have been denied | [ ] |
| T-14 | Steve controls a bedroom | "Turn off the hallway lights" | Works — hallway is common | [ ] |

### Edge Cases

| ID | Scenario | Message to Send | Expected Result | Pass? |
|----|----------|-----------------|-----------------|-------|
| T-15 | Entity not in any area | "Turn on hue color downlight 1" | Denied with clear message (entity has no area → requires ha_all) OR Iji finds it via area and controls it | N/A | Lee has ha_all — test only meaningful for non-admin. Moved to Steve's block. |
| T-16 | Group vs individual bulb preference | "Turn on the workshop lights" | Iji should prefer `light.workshop` (group) over individual cans | [x] | Lights were already on from T-08 but Iji targeted group entity. T-02 also showed clear group vs individual distinction. |

## Signal-Specific Tests

| ID | Scenario | Pass? |
|----|----------|-------|
| S-01 | DM to Iji → reply comes back as DM | [x] | All Lee tests via Signal DM worked correctly |
| S-02 | Steve's DM → reply goes to Steve, not Lee | [ ] | Deferred — Steve not home |

## Regression Checks

| Area | Check | Pass? |
|------|-------|-------|
| Startup | `journalctl -u iji.service` shows no new errors after restart | [x] | Service running, no errors observed during testing |
| Knowledge tools | "What do you know about dinner?" still works | [x] | No regressions reported |
| Calendar tools | "What's on my calendar today?" still works | [x] | No regressions reported |
| Signal broker | Messages received and replied to normally | [x] | All 12 test messages sent/received correctly |

## Log Verification (Engineer via EC2)

```bash
# Run after Product tests:
journalctl -u iji.service --no-pager -n 100
```

| Check | Status |
|-------|--------|
| `ha_query` tool called with area parameter visible in logs | [ ] |
| `ha_control` tool called, area resolved in logs | [ ] |
| No HA API 401/403 errors | [ ] |
| No "Permission denied" for Steve on common areas | [ ] |
| Cache behavior: second area query within 10 min doesn't re-fetch from HA | [ ] |

## Result

- [x] **CONDITIONAL PASS** — All Lee tests green. Steve's tests (T-11–T-14, T-15, S-02) deferred until he's home. No failures, no regressions.
- [ ] **FAIL** — Issues found. See notes. → Bugfix spec needed.

## Rollout

All household members already have `ha_common`. No per-person blockers expected.

- [x] Lee can control lights in all areas via Signal DM
- [ ] Steve can control lights in all areas via Signal DM (deferred — Steve not home)
- [ ] Update `docs/rollout.md` — mark "HA area permission robustness" as verified
- [ ] Update `BACKLOG.md` — change status from 🔧 Fix pending to ✅ Verified
