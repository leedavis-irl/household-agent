# Iji Backlog (Capability Buckets)

The backlog is the single source of truth for what to build and fix.

## Scorecard

| Bucket | Verified | Fix Pending | Untested | Not Built |
|--------|----------|-------------|----------|-----------|
| Scheduling & Coordination | 4 | 0 | 0 | 5 |
| Communication | 3 | 0 | 0 | 5 |
| Email & Documents | 2 | 0 | 0 | 6 |
| Finances | 3 | 0 | 0 | 3 |
| Home Operations | 2 | 1 | 0 | 10 |
| Meals & Kitchen | 0 | 0 | 0 | 5 |
| Children | 0 | 0 | 0 | 4 |
| Weather & Daily Ops | 2 | 0 | 0 | 4 |
| Maintenance & Property | 0 | 0 | 0 | 6 |
| Institutional Memory | 2 | 0 | 0 | 7 |
| Vehicles & Transport | 0 | 0 | 0 | 4 |
| Entertaining & Hospitality | 0 | 0 | 0 | 4 |
| Procurement | 0 | 0 | 0 | 6 |
| Meta & Infrastructure | 2 | 2 | 0 | 9 |

Status legend: ✅ Verified / 🔧 Fix pending / ⚠️ Untested / ❌ Not built

---

## 1) 🗓️ Scheduling & Coordination

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| View personal/shared schedules | `calendar_query` | ✅ Verified | Adults with calendar permissions | High | Requires service account + `calendar_id` in `household.json` |
| Create calendar events | `calendar_create` | ✅ Verified | Adults with `calendar_own`/`calendar_all` | High | Read-only calendars return actionable error |
| Modify/cancel calendar events | `calendar_modify` | ✅ Verified | Adults with `calendar_own`/`calendar_all` | High | Supports `event_id` or summary+date lookup |
| Find overlapping free time | `calendar_freebusy` | ✅ Verified | Adults with `calendar_household` or `calendar_all` | High | Missing member calendars are noted, not fatal |
| Household conflict detection | not built | ❌ Not built | Not rolled out | Medium | Detect double-bookings, kid pickup conflicts, shared-car conflicts |
| Reminder lifecycle (set/list/fire) | `reminder_set`, `reminder_list` (not built) | ❌ Not built | Not rolled out | High | Needs scheduler + delivery channel |
| Morning briefing | not built | ❌ Not built | Not rolled out | High | Proactive daily summary capability |
| Multi-person scheduling negotiation | not built | ❌ Not built | Not rolled out | High | Reasoning layer on top of freebusy |
| Task delegation + follow-up | `task_create`, `task_query`, `task_update` (not built) | ❌ Not built | Not rolled out | High | Assign/track/follow-up workflow across household members |

## 2) 💬 Communication

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Signal inbound/outbound assistant | `src/broker/signal.js`, `src/router/signal.js` | ✅ Verified | Household on Signal | High | Core channel working in production |
| Relay/announce to people and groups | `message_send` | ✅ Verified | Adults (`message_send`) | High | Uses Signal + group registry (`signal_groups`) |
| Delivery confirmation correctness | `message_send` | ✅ Verified | Adults | High | Tool now returns send failure when Signal TCP client is unavailable |
| Slack channel adapter | not built | ❌ Not built | Not rolled out | Medium | Architecture supports it; implementation pending |
| Slack message search | `slack_search` (not built) | ❌ Not built | Not rolled out | Medium | Needs Slack API integration + auth |
| SMS channel for non-Signal contacts | not built | ❌ Not built | Not rolled out | High | Twilio adapter needed (Lisa/contractors/schools) |
| Email as a channel (inbound/outbound) | not built | ❌ Not built | Not rolled out | Medium | Distinct from Gmail search/read tools |
| Voice channel adapter | not built | ❌ Not built | Not rolled out | Medium | Wyoming/STT/TTS path documented in architecture |

## 3) 📬 Email & Documents

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Search Gmail | `email_search` | ✅ Verified | Lee only (OAuth token currently present) | High | Verified for Lee; other adults require their own OAuth token setup |
| Read full Gmail message/thread | `email_read` | ✅ Verified | Lee only (OAuth token currently present) | High | Verified for Lee; other adults require their own OAuth token setup |
| Send email on behalf of user | `email_send` (not built) | ❌ Not built | Not rolled out | Medium | Requires Gmail modify scope + per-user OAuth |
| Draft email for review | `email_draft` (not built) | ❌ Not built | Not rolled out | Medium | Requires Gmail modify scope + per-user OAuth |
| Search shared Drive docs | `docs_search` (not built) | ❌ Not built | Not rolled out | Low | Needs Drive API tool |
| Read Google Docs content | `docs_read` (not built) | ❌ Not built | Not rolled out | Low | Needs Drive/Docs read tools |
| Weekly family-doc sync | `scripts/sync-docs-to-gdoc.js` | ❌ Not built | Not rolled out | Medium | Script exists; production scheduling/verification still needed |
| Generate operational documents | not built | ❌ Not built | Not rolled out | Medium | Packing lists, summaries, prep docs, reports |

## 4) 💰 Finances

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Query transactions | `finance_transactions` | ✅ Verified | Lee only (`financial` permission) | High | Verified on EC2 with current Monarch auth/session setup |
| Payback ledger visibility | `finance_paybacks` | ✅ Verified | Lee only (`financial`) | High | Verified expected behavior: returns "not configured" when state file is absent; no hardcoded Mac path |
| Cost/usage visibility for Iji | `cost_query` | ✅ Verified | Lee only (`financial`) | Medium | Reads `claude_usage` in SQLite |
| Account balances snapshot | `finance_balances` (not built) | ❌ Not built | Not rolled out | Medium | Planned Monarch-derived capability |
| Budget tracking by category | `finance_budget` (not built) | ❌ Not built | Not rolled out | Medium | Planned Monarch-derived capability |
| Bill due reminders | not built | ❌ Not built | Not rolled out | Low | Proactive feature from status/backlog |

## 5) 🏠 Home Operations

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Query home/device state | `ha_query` | ✅ Verified | All members with HA permissions | High | Uses HA REST API + token; EC2 reaches HA via Tailscale (`100.127.233.50`) |
| Control devices | `ha_control` | ✅ Verified | Adults/admin per permissions | High | Area-gated control path works; EC2 reaches HA via Tailscale (`100.127.233.50`) |
| HA area permission robustness | `ha_control` | 🔧 Fix pending | Adults/admin | Medium | Known issue: substring matching can false-deny valid entities |
| Presence query ("who is home") | `ha_query` (`person.*`) | ❌ Not built | Not rolled out | Medium | Primitive exists; explicit capability not productized |
| Scene/automation triggers | `ha_scene` (not built) | ❌ Not built | Not rolled out | Medium | Planned HA service tooling |
| Historical state analysis | `ha_history` (not built) | ❌ Not built | Not rolled out | Medium | Planned HA history endpoint tool |
| HA notification dispatch | `ha_notify` (not built) | ❌ Not built | Not rolled out | Low | Planned HA notify tools |
| Anomaly detection over sensors | not built | ❌ Not built | Not rolled out | Medium | Interpreted anomaly alerts (door/water/temp) |
| Presence inference engine | not built | ❌ Not built | Not rolled out | Medium | Probabilistic presence from multi-source signals |
| HA automation authoring | not built | ❌ Not built | Not rolled out | Medium | Draft/deploy automations with approval workflow |
| Camera/image understanding | not built | ❌ Not built | Not rolled out | Low | Doorbell/fridge/room context via vision inputs |
| Wall/room display intelligence layer | not built | ❌ Not built | Not rolled out | Low | Dynamic context output for room displays (hardware in `docs/hardware.md`) |
| Physical world orchestration | not built | ❌ Not built | Not rolled out | Low | Vacuum/sprinklers/laundry coordination from context |

## 6) 👨‍🍳 Meals & Kitchen

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Recipe memory + ratings | `meals_recipes` (not built) | ❌ Not built | Not rolled out | High | Seed from Firen's spreadsheet |
| Weekly menu management | `meals_menu` (not built) | ❌ Not built | Not rolled out | High | Chef proposal + household feedback cycle |
| Post-meal feedback capture | `meals_feedback` (not built) | ❌ Not built | Not rolled out | Medium | Depends on outreach + recipe DB |
| Chef communication automation | not built | ❌ Not built | Not rolled out | High | SMS channel (Twilio) is prerequisite |
| Kitchen inventory + meal ops | not built | ❌ Not built | Not rolled out | Medium | Extend into pantry/inventory tracking |

## 7) 👶 Children

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| AM/PM routine tracking | not built | ❌ Not built | Not rolled out | High | Depends on HA/ESPHome routine hardware flow |
| School/activity schedule assistant | not built | ❌ Not built | Not rolled out | High | Calendar + reminders + coordination |
| Medical/permission-slip tracking | not built | ❌ Not built | Not rolled out | Medium | Structured records + reminders needed |
| Homework tracking support | not built | ❌ Not built | Not rolled out | Medium | Child-focused workflow not yet implemented |

## 8) 🌤️ Weather & Daily Ops

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Current weather + forecast | `weather_query` | ✅ Verified | Open to all users | Medium | No key needed (NWS). Verified end-to-end on server |
| Weather permission policy documentation | `weather_query` | ✅ Verified | Open to all users | Low | Open-access policy is now documented in `permissions.js` comments |
| Outfit/departure guidance | not built | ❌ Not built | Not rolled out | Medium | Uses weather + calendar + routines |
| Severe weather alerts | not built | ❌ Not built | Not rolled out | Low | Proactive trigger infrastructure required |
| Daily departure checklist | not built | ❌ Not built | Not rolled out | Medium | Intended for front-door display and messaging |
| Anticipatory daily operations | not built | ❌ Not built | Not rolled out | High | Event-driven proactive nudges (weather/calendar/email context) |

## 9) 🔧 Maintenance & Property

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Maintenance/service log | `maintenance_log` (not built) | ❌ Not built | Not rolled out | Low | Appliance/service history |
| Contractor/vendor contacts | `contacts_search` (not built) | ❌ Not built | Not rolled out | Low | Address book + context by trade |
| Warranty tracking | not built | ❌ Not built | Not rolled out | Medium | Could integrate with asset registry |
| Service scheduling reminders | not built | ❌ Not built | Not rolled out | Medium | Seasonal + interval reminders |
| Grounds/landscape task tracking | not built | ❌ Not built | Not rolled out | Low | Linked to maintenance operations |
| Vendor coordination lifecycle | not built | ❌ Not built | Not rolled out | Low | Draft/follow-up coordination for contractors with human approval |

## 10) 🧠 Institutional Memory

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Store household facts | `knowledge_store` | ✅ Verified | Everyone with knowledge permissions | High | SQLite-backed memory write path |
| Retrieve household facts | `knowledge_search` | ✅ Verified | Everyone with knowledge permissions | High | Search + expiry filtering |
| Preference profiles (learned) | not built | ❌ Not built | Not rolled out | Medium | Confidence-scored learned preferences |
| Routine detection | not built | ❌ Not built | Not rolled out | Medium | Batch analytics over prior behavior |
| Feedback loops on suggestions | not built | ❌ Not built | Not rolled out | Low | Improve recommendations over time |
| Forgetting curves / TTL tiers | not built | ❌ Not built | Not rolled out | Medium | Long-term memory hygiene |
| Institutional procedures/runbooks | not built | ❌ Not built | Not rolled out | Low | Repeatable process memory |
| Decision log with rationale | not built | ❌ Not built | Not rolled out | Low | Durable household decision context |
| Passive group fact extraction | not built | ❌ Not built | Not rolled out | High | Requires explicit privacy decision |

## 11) 🚗 Vehicles & Transport

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Transit directions | `transit_directions` (not built) | ❌ Not built | Not rolled out | Low | Google Maps API integration |
| Vehicle maintenance schedule | not built | ❌ Not built | Not rolled out | Medium | Recurring reminders + records |
| Registration/insurance tracking | not built | ❌ Not built | Not rolled out | Medium | Renewal reminders + document refs |
| Parking/charging logistics | not built | ❌ Not built | Not rolled out | Low | Coordination + reminder workflows |

## 12) 🎉 Entertaining & Hospitality

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Guest list and visitor profiles | not built | ❌ Not built | Not rolled out | Low | Frequent visitor + context memory |
| Event planning checklists | not built | ❌ Not built | Not rolled out | Low | Could use document-generation capability |
| Guest room readiness workflow | not built | ❌ Not built | Not rolled out | Low | Crosses home ops + inventory |
| Social obligation tracking (RSVP/gifts) | not built | ❌ Not built | Not rolled out | Low | Correspondence + reminders |

## 13) 🛒 Procurement

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Safeway staples list management | `safeway_list` (not built) | ❌ Not built | Not rolled out | High | Shared list + approval model |
| Skip recurring delivery | `safeway_skip` (not built) | ❌ Not built | Not rolled out | High | Needs reverse-engineered Safeway API |
| Sync staples to Safeway order | `safeway_order` (not built) | ❌ Not built | Not rolled out | High | Depends on auth/session stability |
| Package/delivery tracking | not built | ❌ Not built | Not rolled out | Medium | Parse email + carrier tracking |
| Proactive restocking recommendations | not built | ❌ Not built | Not rolled out | Medium | Inventory + spend pattern intelligence |
| Meal planning + grocery coordination intelligence | not built | ❌ Not built | Not rolled out | Medium | Dietary preferences + purchase patterns into plan suggestions |

## 14) 🔍 Meta & Infrastructure

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Cost telemetry query | `cost_query` | ✅ Verified | Lee only (`financial`) | Medium | Useful for governance and budget checks |
| Secret synchronization hygiene | not built | 🔧 Fix pending | Not rolled out | High | CI deploys code but not gitignored secret files |
| Environment template completeness | not built | ✅ Verified | Not rolled out | Medium | `.env.example` now documents required/optional runtime env vars |
| Daily automated health checks | `scripts/health-check.js` | 🔧 Fix pending | Lee only alerts | High | Should auto-write `STATUS.md` + DM on failures |
| Security hardening wave | not built | ❌ Not built | Not rolled out | Medium | Scope audits, key rotation, access review, abuse controls |
| Web search capability | `web_search` (not built) | ❌ Not built | Not rolled out | Medium | Evaluate Brave/Tavily/SerpAPI |
| Tool authoring (self-extension) | not built | ❌ Not built | Not rolled out | Low | Meta-cognitive capability |
| Confidence calibration | not built | ❌ Not built | Not rolled out | Medium | Staleness-aware confidence outputs |
| Escalation intelligence | not built | ❌ Not built | Not rolled out | Medium | Autonomy boundary learning |
| Conversation quality self-review | not built | ❌ Not built | Not rolled out | Low | Follow-up quality checks |
| Relationship graph | not built | ❌ Not built | Not rolled out | Medium | Evaluate Monica per Growth Protocol |
| Asset registry | not built | ❌ Not built | Not rolled out | Medium | Evaluate Homebox per Growth Protocol |
| Automation authoring for HA | not built | ❌ Not built | Not rolled out | Medium | Approval workflow required |

---

## Suggested Build Order (Updated)

### Wave A — Stabilize Existing Wave 2 Capabilities
1. Deploy/verify `email_search` + `email_read` fix (Email & Documents).
2. Fix `finance_paybacks` EC2 state-file dependency (Finances).
3. Confirm `finance_transactions` and `weather_query` end-to-end via Signal (Finances + Weather).
4. Fix `message_send` delivery-result reporting (Communication).
5. Implement `.env.example` + secret-process cleanup (Meta & Infrastructure).

### Wave B — Proactive Core
6. Build reminders engine (`reminder_set`, `reminder_list`) and trigger loop (Scheduling).
7. Build morning briefing + proactive alerts (Scheduling, Weather, Maintenance).
8. Add `web_search` for unknowns (Meta).

### Wave C — Write/Comms Expansion
9. Build Gmail write tools (`email_send`, `email_draft`) with scope upgrade + re-auth rollout (Email).
10. Add Slack/SMS channel adapters (Communication), unblocking chef workflow.
11. Add Drive tools (`docs_search`, `docs_read`) (Email & Documents).

### Wave D — Household Operations Depth
12. Build `ha_history`, `ha_scene`, `ha_notify` (Home Operations).
13. Build meals stack (`meals_recipes`, `meals_menu`, `meals_feedback`) + chef workflow (Meals).
14. Build Safeway stack (`safeway_list`, `safeway_skip`, `safeway_order`) (Procurement).
15. Build `maintenance_log` + `contacts_search` + transport basics (Maintenance, Vehicles).

### Wave E — Intelligence Layers
16. Situational awareness stack (passive extraction, anomaly detection, presence inference, deliveries, AirTag).
17. Coordination engine (task delegation, conflict detection, multi-person negotiation).
18. Learning/memory upgrades (preferences, routines, forgetting curves, decision log).
