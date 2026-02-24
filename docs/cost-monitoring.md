# Cost monitoring (Claude API)

Iji tracks Claude API token usage and estimated cost so the household can see what Iji costs.

## What is tracked

- Every Claude API call during a `think()` (including each turn of the tool-use loop) is logged to SQLite: timestamp, person, conversation, model, input/output tokens, and estimated cost (USD).
- Cost is computed from configurable per-model pricing in `src/utils/claude-pricing.js`. Update those values when Anthropic changes prices.

## cost_query tool

People with the **financial** permission can ask Iji questions like:

- "How much has Iji cost this month?"
- "What's the daily average?"
- "Who uses Iji the most?"

Iji uses the `cost_query` tool with optional filters:

- **date_from** / **date_to**: YYYY-MM-DD (default: start of month through today).
- **person_id**: filter by person (e.g. `lee`, `steve`).
- **group_by**: `day` for daily totals, `person` for per-person breakdown, `none` for a single total.

## Daily summary in logs

Once per day (on the first hourly check after midnight), Iji logs a **daily cost summary** for the previous calendar day to the structured log. No need to query the DB to see it in log files. Look for log lines with message `"Daily cost summary"` and fields like `date`, `total_cost_usd`, `total_api_calls`, `by_person`.

## Weekly report to Lee

A weekly cost summary is sent to **Lee only** (Signal DM, not the group).

**Contents:**

- Total cost for the past 7 days and total API calls.
- Comparison to the previous 7 days (up or down).
- Breakdown by person for the past 7 days.
- Running monthly total (current month to date).

**Script (run from project root):**

```bash
node scripts/weekly-cost-report.js
```

**Cron (e.g. Sunday 18:00, same time as docs sync):**

```bash
0 18 * * 0 cd /path/to/household-agent && node scripts/weekly-cost-report.js >> /path/to/household-agent/logs/weekly-cost.log 2>&1
```

Ensure the cron environment has:

- **SIGNAL_ACCOUNT** (and optionally **SIGNAL_CLI_PATH**) so the script can send the DM via signal-cli. On EC2 set `SIGNAL_CLI_PATH=/opt/signal-cli-0.13.24/bin/signal-cli`.
- Access to `config/household.json` (Lee’s Signal number is read from `members.lee.identifiers.signal`).
- The app’s data directory so the SQLite DB at `data/iji.db` is available.

Create `logs/` and add `logs/*.log` to `.gitignore` if you don’t want to commit log files.
