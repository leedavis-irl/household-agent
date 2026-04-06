# Verification: Monarch → Google Sheets Asset Sync

**Spec:** `specs/finances/ASSET-SYNC.md`
**Date:** 2026-04-04
**Verified by:** Claude (Engineer) + Lee (Product)

---

## Pre-Deploy Checks (Engineer/Dev)

| Check | Status | Notes |
|-------|--------|-------|
| Code compiles / no syntax errors | [x] | `node --check` passes on all 4 files |
| Only spec'd files were modified | [x] | sheets.js, sync-assets.js, google-oauth.js, index.js, .env.example + spec files |
| `npm test` passes (if tests exist) | [ ] | Run before merge |
| Env vars added to `.env.example` | [x] | `FINANCE_SPREADSHEET_ID=` in Monarch section |
| No secrets in committed code | [x] | Spreadsheet ID is public to family — env var is for config cleanliness, not secrecy |

## Server Configuration (Engineer → Product)

| Requirement | Applied? | Notes |
|-------------|----------|-------|
| `FINANCE_SPREADSHEET_ID` in EC2 `.env` | [ ] | Value: `193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo` |
| Lee re-authorizes Google OAuth w/ `spreadsheets` scope | [ ] | Existing token lacks this scope |
| Assets tab B9/B18/B26 positions match spec | [ ] | Open sheet, confirm rows before first run |

## Functional Tests (Engineer via direct invocation)

| ID | Scenario | Command | Expected Result | Pass? |
|----|----------|---------|-----------------|-------|
| T-01 | Happy path on EC2 | `ssh ec2 "cd household-agent && node src/jobs/sync-assets.js"` | Exit 0, logs "Asset sync: complete" | [ ] |
| T-02 | B9 populated | Open sheet, check Assets!B9 | Non-zero number matching sum of Monarch investment accounts | [ ] |
| T-03 | B18 populated | Open sheet, check Assets!B18 | Non-zero number matching sum of real_estate + other_asset | [ ] |
| T-04 | B26 populated | Open sheet, check Assets!B26 | Recent Pacific timestamp | [ ] |
| T-05 | Inputs tab flows through | Open sheet, check Inputs!Current Portfolio Value | Reflects new B9 value | [ ] |
| T-06 | Monarch auth failure alert | Delete `data/monarch-session.json` + set bad MONARCH_PASSWORD, run job | Signal DM to Lee: "Asset sync failed: Monarch authentication error." | [ ] |
| T-07 | Sheets auth failure alert | Temporarily clobber Lee's entry in `data/oauth-tokens.json`, run job | Signal DM to Lee: "Asset sync failed: Could not write to Google Sheets." | [ ] |
| T-08 | Startup auto-run | Restart iji.service, wait 60s, check logs | "Asset sync: startup run" followed by "Asset sync: complete" | [ ] |

## Regression Checks

| Area | Check | Pass? |
|------|-------|-------|
| Startup | `journalctl -u iji.service -n 50` shows no new errors | [ ] |
| Gmail tool | Send a test email through Iji — still works (OAuth reshare didn't break Gmail scope) | [ ] |
| Calendar tool | Ask Iji for today's events — still works | [ ] |
| Monarch tools | Ask Iji "what's my current checking balance" — still works | [ ] |
| Signal broker | Normal DM to Iji still replies | [ ] |

## Log Verification (Engineer via EC2)

```bash
ssh -i ~/.ssh/the-pem-key.pem ubuntu@34.208.73.189
journalctl -u iji.service --no-pager -n 100 | grep -i "asset sync"
```

| Check | Status |
|-------|--------|
| "Asset sync: startup run" appears within 1 min of restart | [ ] |
| "Asset sync: computed totals" logged with plausible numbers | [ ] |
| "Sheets write ok" logged 3 times (B9, B18, B26) | [ ] |
| "Asset sync: complete" logged | [ ] |
| No "UNAUTHORIZED" or 401/403 errors | [ ] |

## Result

- [ ] **PASS** — All checks green. Feature is complete.
- [ ] **FAIL** — Issues found. See notes. → Bugfix spec needed.

## Rollout

This is a headless background job — no user-facing rollout. Only Lee interacts with it (indirectly, via the finance spreadsheet).

- [ ] Lee has confirmed the finance model still calculates correctly after first sync
- [ ] Monthly run on the 1st verified by Lee at least once before considering the feature fully adopted
