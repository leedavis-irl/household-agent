# Spec: Monarch → Google Sheets Asset Sync

**ID:** FINANCES-ASSET-SYNC
**Author:** Claude (Engineer)
**Status:** Approved
**GitHub Issue:** —

---

## Problem

The family's finance model lives in a Google Sheet ("Finance Model"). The "Current Portfolio Value" input on the Inputs tab references `Assets!B9`, but nobody is keeping the Assets tab up to date — it has to be refreshed manually from Monarch each month, which means in practice it drifts.

## Context

Iji already has a working Monarch Money integration (`src/utils/monarch.js`) with `getAccounts()` returning accounts + balances + `type { name }`. It also has Google OAuth per-user token infrastructure (`src/utils/google-oauth.js`) currently used for Gmail and Drive. No Sheets API wrapper exists yet.

Read ARCHITECTURE.md for the four-flow design — this feature is a scheduled job, not a tool. It runs in the background and does not go through the brain/router.

## Goal

Every month, pull asset balances from Monarch, sum them by type, and write the totals into the Assets tab of the finance spreadsheet so the model always reflects current reality.

## Design Decision

**OAuth, not service account.** Calendar uses a service account; Gmail/Drive use per-user OAuth. Sheets could go either way, but the finance model is owned by Lee personally and we already have Lee's OAuth refresh token. Using OAuth (Lee's identity) avoids sharing the sheet with a new service account principal and reuses existing infrastructure. Cost: re-auth is required to grant the new `spreadsheets` scope.

**`setInterval` scheduler, not `node-cron`.** The project has no cron dependency and all other schedulers (`morning-briefing.js`, `daily-ops.js`, `reminder-scheduler.js`) use a 1-minute `setInterval` that checks Pacific time and dedupes by date key. Adding `node-cron` for one monthly job is unjustified dependency creep. We follow the house pattern.

**Errors route to Signal, not just logs.** Asset sync runs headless — if it silently fails for six months, the finance model becomes wrong and Lee would only notice when making a decision based on stale data. Separate `MonarchAuthError` and `SheetsWriteError` classes produce distinct Signal messages so Lee knows exactly what to fix.

**Startup run + monthly schedule.** Running only on the 1st of the month means bugs aren't visible until 30 days after deploy. A 30s-delayed startup run exercises the full path immediately on every deploy without materially changing when the monthly write happens.

## What to Build

### 1. Google Sheets utility

**File:** `src/utils/sheets.js` (Create)

Lightweight wrapper around `google.sheets({version: 'v4'})`. Reuses `getClient(personId, scopes)` from `google-oauth.js`.

**Exports:**
- `writeValues(spreadsheetId, range, values, personId='lee')` — calls `spreadsheets.values.update` with `valueInputOption: 'USER_ENTERED'`. Caches the sheets client per-person; invalidates the cache on any write error so stale/revoked auth recovers on next call.

### 2. Sheets OAuth scope

**File:** `src/utils/google-oauth.js` (Modify)

Add `SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets']` and include it in `ALL_GOOGLE_SCOPES` so a re-auth grants it alongside Gmail/Drive.

### 3. Asset sync job

**File:** `src/jobs/sync-assets.js` (Create — establishes new `src/jobs/` directory)

Pulls from Monarch, sums by `type.name`, writes to Sheets.

**Cell targets (Assets tab):**

| Value | Cell | Source |
|---|---|---|
| Total Investable | `Assets!B9` | sum of `type.name === 'investment'` |
| Total Illiquid | `Assets!B18` | sum of `type.name === 'real_estate'` + `'other_asset'` |
| Last Synced | `Assets!B26` | Pacific timestamp string |

**Exports:**
- `syncAssets()` — never throws. Returns `{ok, totalInvestable, totalIlliquid}` or `{ok:false, error}`. On `MonarchAuthError` → Signals Lee "Asset sync failed: Monarch authentication error." On `SheetsWriteError` → Signals Lee "Asset sync failed: Could not write to Google Sheets."
- `startAssetSyncScheduler({startupDelayMs})` — kicks off a 30s-delayed startup run and a 1-minute `setInterval` that fires `syncAssets()` when Pacific date is day=1 and hour≥6, deduped by `YYYY-MM`.

**Direct invocation:** `node src/jobs/sync-assets.js` runs the sync once and exits with code 0/1. Used for local testing and EC2 smoke tests.

### 4. Scheduler registration

**File:** `src/index.js` (Modify)

After `startDailyOps()`, if `FINANCE_SPREADSHEET_ID` is set, import and call `startAssetSyncScheduler()`. Guard on env var presence so existing deploys without the var are unaffected.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/utils/sheets.js` | Create | Google Sheets v4 writer |
| `src/jobs/sync-assets.js` | Create | Monarch → Sheets sync + scheduler |
| `src/utils/google-oauth.js` | Modify | Add `SHEETS_SCOPES`, include in `ALL_GOOGLE_SCOPES` |
| `src/index.js` | Modify | Register asset sync scheduler |
| `.env.example` | Modify | Document `FINANCE_SPREADSHEET_ID` |

## Server Requirements

- [ ] Env var `FINANCE_SPREADSHEET_ID=193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo` added to EC2 `.env`
- [x] Env var added to `.env.example`
- [x] Dependency installed (`googleapis` already in `package.json`)
- [ ] Lee re-authorizes Google OAuth — existing token lacks the `spreadsheets` scope
- [ ] Assets tab B9/B18/B26 positions verified against live sheet before first run

## Dependencies

Zero new dependencies. `googleapis` is already installed for Calendar/Gmail.

## Do NOT Change

- `src/utils/monarch.js` — asset sync only calls existing `getAccounts()`
- `src/utils/google-oauth.js` aside from adding `SHEETS_SCOPES`
- Any existing scheduler — we add a new one alongside, we don't modify

## Commit Message

`feat: monarch → google sheets asset sync (monthly)`
