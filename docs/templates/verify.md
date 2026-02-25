# Verification: [Feature/Bugfix Name]

**Spec:** [Link to spec file]
**Date:** YYYY-MM-DD
**Verified by:** [Engineer / Product]

---

## Pre-Deploy Checks (Engineer/Dev)

| Check | Status | Notes |
|-------|--------|-------|
| Code compiles / no lint errors | [ ] | |
| Only spec'd files were modified | [ ] | |
| `npm test` passes (if tests exist) | [ ] | |
| Env vars added to `.env.example` | [ ] | |
| No secrets in committed code | [ ] | |

## Server Configuration (Engineer → Product)

| Requirement | Applied? | Notes |
|-------------|----------|-------|
| [List each env var / config from spec] | [ ] | |

## Functional Tests (Product via Signal)

| ID | Scenario | Message to Send | Expected Result | Pass? |
|----|----------|-----------------|-----------------|-------|
| T-01 | Happy path | [exact message] | [expected response] | [ ] |
| T-02 | Error case | [exact message] | [expected behavior] | [ ] |
| T-03 | Permission denied | [message from unpermitted user] | [denied message] | [ ] |

## Signal-Specific Tests

| ID | Scenario | Pass? |
|----|----------|-------|
| S-01 | DM to Iji → reply comes back as DM | [ ] |
| S-02 | Group @mention → reply goes to group, not DM | [ ] |
| S-03 | Unknown sender → rejection message sent | [ ] |

## Regression Checks

| Area | Check | Pass? |
|------|-------|-------|
| Startup | `journalctl` shows no new errors after restart | [ ] |
| Existing tools | [pick 1-2 existing tools] still work | [ ] |
| Signal broker | Messages still received and replied to | [ ] |

## Log Verification (Engineer via EC2)

```bash
# Run after Product tests:
journalctl -u iji.service --no-pager -n 50
```

| Check | Status |
|-------|--------|
| Tool executed with correct name | [ ] |
| No unexpected errors in logs | [ ] |
| Reply sent to correct recipient (not null) | [ ] |
| Auth tokens valid (no 401/403) | [ ] |

## Result

- [ ] **PASS** — All checks green. Feature is complete.
- [ ] **FAIL** — Issues found. See notes. → Bugfix spec needed.
