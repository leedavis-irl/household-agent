# Iji Status Check

Last check: 2026-02-25T02:54:45.763Z

## Per-Tool Status

| Tool | File | Server Status | Notes |
|------|------|---------------|-------|
| `knowledge_search` | `knowledge-search.js` | ✅ Verified | SQLite availability and schema |
| `knowledge_store` | `knowledge-store.js` | ✅ Verified | SQLite availability and schema |
| `ha_query` | `ha-query.js` | 🔧 Fix pending | HA URL/token reachable \| HA API request failed: fetch failed |
| `ha_control` | `ha-control.js` | 🔧 Fix pending | HA URL/token reachable \| HA API request failed: fetch failed |
| `calendar_query` | `calendar.js` | ✅ Verified | Google service account file exists |
| `calendar_create` | `calendar-create.js` | ✅ Verified | Google service account file exists |
| `calendar_modify` | `calendar-modify.js` | ✅ Verified | Google service account file exists |
| `calendar_freebusy` | `calendar-freebusy.js` | ✅ Verified | Google service account file exists |
| `message_send` | `message-send.js` | 🔧 Fix pending | Signal daemon reachable on TCP 7583 \| Signal daemon unreachable: connect ECONNREFUSED 127.0.0.1:7583 |
| `weather_query` | `weather-query.js` | 🔧 Fix pending | NWS endpoint reachable \| NWS API request failed: fetch failed |
| `finance_transactions` | `finance-transactions.js` | 🔧 Fix pending | Monarch auth health check \| fetch failed |
| `finance_paybacks` | `finance-paybacks.js` | 🔧 Fix pending | Paybacks state-file dependency \| Paybacks state file missing at /Users/elizabethdavis/Projects/Financial/monarch-slack-integration/data/state.json. Set MONARCH_PAYBACKS_STATE_FILE on EC2. |
| `cost_query` | `cost-query.js` | ✅ Verified | SQLite claude_usage table |
| `email_search` | `email-search.js` | ✅ Verified | OAuth credentials + refresh token validation |
| `email_read` | `email-read.js` | ✅ Verified | OAuth credentials + refresh token validation |

## Failures

- ha_query: HA URL/token reachable | HA API request failed: fetch failed
- ha_control: HA URL/token reachable | HA API request failed: fetch failed
- message_send: Signal daemon reachable on TCP 7583 | Signal daemon unreachable: connect ECONNREFUSED 127.0.0.1:7583
- weather_query: NWS endpoint reachable | NWS API request failed: fetch failed
- finance_transactions: Monarch auth health check | fetch failed
- finance_paybacks: Paybacks state-file dependency | Paybacks state file missing at /Users/elizabethdavis/Projects/Financial/monarch-slack-integration/data/state.json. Set MONARCH_PAYBACKS_STATE_FILE on EC2.
