# Health Check — Operations Runbook

## What it does

`scripts/health-check.js` checks every external dependency Iji relies on:

- **SQLite** — knowledge, signal_groups, claude_usage tables exist
- **Home Assistant** — HA_URL/HA_TOKEN reachable via Tailscale
- **Signal daemon** — TCP connection to 127.0.0.1:7583
- **NWS weather API** — api.weather.gov reachable
- **Google service account** — credentials file exists
- **Google OAuth** — refresh token valid for Lee
- **Monarch** — auth health check passes
- **Finance paybacks** — state file exists (MONARCH_PAYBACKS_STATE_FILE)
- **Anthropic API key** — ANTHROPIC_API_KEY env var present

On completion it writes `STATUS.md` at the project root. If any check fails, it sends a Signal DM to Lee.

## Cron schedule

```
# Iji daily health check — 7:05 AM UTC (12:05 AM Pacific)
5 7 * * * cd /home/ubuntu/household-agent && /usr/bin/node scripts/health-check.js >> /home/ubuntu/household-agent/logs/health-check.log 2>&1
```

Installed via `crontab -e` on EC2 (`ubuntu` user).

## Log location

`/home/ubuntu/household-agent/logs/health-check.log` — appended on each run.

## Manual run

```bash
ssh iji-server
cd /home/ubuntu/household-agent
node scripts/health-check.js
cat STATUS.md
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Script hangs | Signal DM send is slow/blocking | Check `signal-cli` process; restart if needed |
| OAuth `invalid_grant` | Lee's Google OAuth refresh token expired | Re-run OAuth flow: `node scripts/google-oauth-setup.js` |
| Paybacks state file missing | `MONARCH_PAYBACKS_STATE_FILE` not set in `.env` | Set it to the correct path or accept the failure if paybacks aren't configured |
| STATUS.md not updating | Cron not running or script crashing early | Check `crontab -l`, check logs, run manually |

## Known non-critical failures

- `finance_paybacks` — state file path differs between Mac (dev) and EC2 (prod). Set `MONARCH_PAYBACKS_STATE_FILE` in `.env` if the paybacks integration is active.
- `email_search` / `email_read` — OAuth tokens expire periodically and need manual re-auth.
