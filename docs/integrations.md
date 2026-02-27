# Iji Integrations and Secrets

## Bolt-On Integration Map

| Service | API | Tools it powers | Auth |
|---------|-----|-----------------|------|
| Home Assistant | REST API | `ha_query`, `ha_control`, future `ha_history`, `ha_scene`, `ha_notify` | Long-lived access token |
| Google Calendar | Calendar API v3 | `calendar_query`, `calendar_create`, `calendar_modify`, `calendar_freebusy` | Service account (shared calendar access) |
| Gmail | Gmail API v1 | `email_search`, `email_read`, future `email_send`, `email_draft` | Per-user OAuth |
| Google Drive/Docs | Drive API v3 + Docs API | future `docs_search`, `docs_read`, docs sync scripts | OAuth or service account |
| Monarch Money | Unofficial API/client | `finance_transactions`, `finance_paybacks`, future `finance_balances`, `finance_budget` | Session auth (fragile) |
| Slack | Bolt + Web API | future `slack_search`, Slack channel adapter | Bot token |
| Signal | signal-cli JSON-RPC | `message_send`, Signal channel adapter | Registered Signal account |
| NWS / OpenWeather | REST APIs | `weather_query` | No key (NWS) or API key (OpenWeather) |
| Brave/Serp/Tavily | REST API | future `web_search` | API key |
| Google Maps | Directions API | future `transit_directions` | API key |
| Apple Find My (via FindMySync) | FindMySync → HA device_tracker | future `findmy_locate` | FindMySync Mac app + HA long-lived token |
| Safeway | Unofficial reverse-engineered API | future `safeway_list`, `safeway_skip`, `safeway_order` | Session auth (fragile) |

## Auth Complexity Notes

- Easy (single token/key): Home Assistant, weather APIs, Brave/Tavily/Serp, Google Maps.
- Medium (service account): Google Calendar and Docs with explicit sharing + scope hygiene.
- Hard (per-user OAuth): Gmail and Drive when acting on behalf of specific household members.
- Fragile (reverse-engineered/session): Monarch and Safeway; expect breakage from upstream changes.

## Secret Files Inventory (EC2)

| File | Required for | How it got there | How to update |
|------|--------------|------------------|---------------|
| `.env` | Runtime configuration and API keys | Manually created/edited on EC2 | SSH to server and edit in place, then restart `iji.service` |
| `config/google-service-account.json` | Calendar/Docs service account auth | Manual copy (gitignored) | `scp` new file to server path and restart service |
| `config/google-oauth-credentials.json` | Gmail OAuth client config | Manual copy (gitignored) | `scp` updated OAuth client file to server |
| `data/oauth-tokens.json` | Per-user Gmail OAuth refresh tokens | Manual copy from trusted local source | `scp` updated token file; confirm permissions; restart service |
| `data/monarch-session.json` | Monarch session persistence | Auto-created at runtime | Remove to force re-auth; ensure env creds remain valid |

## Secret Update Procedure

1. Validate files locally in the project root.
2. Copy to EC2 with `scp` to matching paths under `/home/ubuntu/household-agent/`.
3. Restart service: `sudo systemctl restart iji.service`.
4. Run `scripts/health-check.js` on server and confirm no auth/config failures.
5. If checks fail, send immediate Signal alert to Lee and log the exact missing file/env var.

## Gap to Close

CI/CD deploys code only; it does not synchronize gitignored secrets. Until secret sync is automated, this document is the required runbook for updates and incident recovery.
