# Iji Backlog

The backlog is the single source of truth for what to build and fix.

Organized into **7 Spheres** (domain capabilities serving the household) and the **Engine** (communication, memory, and infrastructure that power everything).

## Scorecard

| Section | Verified | Fix Pending | Untested | Not Built |
|---------|----------|-------------|----------|-----------|
| Scheduling & Logistics | 10 | 0 | 0 | 7 |
| Property & Home | 4 | 0 | 0 | 24 |
| Finances | 5 | 0 | 0 | 1 |
| People & Relationships | 0 | 0 | 0 | 5 |
| Procurement & Errands | 0 | 0 | 0 | 6 |
| Meals & Kitchen | 0 | 0 | 0 | 5 |
| Children | 0 | 0 | 0 | 4 |
| Engine › Communication | 6 | 0 | 2 | 8 |
| Engine › Memory | 2 | 0 | 0 | 7 |
| Engine › Infrastructure | 12 | 0 | 1 | 6 |

Status legend: ✅ Verified / 🔧 Fix pending / ⚠️ Untested / ❌ Not built

---

## Spheres

### 1) 🗓️ Scheduling & Logistics

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| View personal/shared schedules | `calendar_query` | ✅ Verified | Adults with calendar permissions | High | Requires service account + `calendar_id` in `household.json` |
| Create calendar events | `calendar_create` | ✅ Verified | Adults with `calendar_own`/`calendar_all` | High | Read-only calendars return actionable error. Timezone/year parsing fix shipped in calendar timezone bugfix wave. |
| Modify/cancel calendar events | `calendar_modify` | ✅ Verified | Adults with `calendar_own`/`calendar_all` | High | Supports `event_id` or summary+date lookup |
| Find overlapping free time | `calendar_freebusy` | ✅ Verified | Adults with `calendar_household` or `calendar_all` | High | Missing member calendars are noted, not fatal. Pacific timezone display now corrected in shared calendar utils. |
| Household conflict detection | not built | ❌ Not built | Not rolled out | Medium | Detect double-bookings, kid pickup conflicts, shared-car conflicts |
| Reminder lifecycle (set/list/fire) | `reminder_set`, `reminder_list`, `reminder_update` | ✅ Verified | Adults with `reminders` + `reminders_others` | High | Spec: `specs/REMINDERS-V1.md`. Decision: `docs/decisions/2026-02-26-reminders-v1.md`. Time-based reminders, 60s scheduler, follow-up cycling, cross-person with creator notifications. Scheduler infrastructure reusable for morning briefings. |
| Morning briefing (v1) | `src/utils/morning-briefing.js` | ✅ Verified | Lee + Kelly | High | 9am Pacific daily Signal DM. Calendar, weather, reminders, knowledge. Per-person delivery hour in household.json. Email digest deferred to v2. Spec: `specs/MORNING-BRIEFINGS-V1.md`. Decision: `docs/decisions/2026-02-26-morning-briefings-v1.md`. |
| Morning briefing opt-in/out | `briefing_subscribe`, `briefing_status` | ✅ Verified | Adults with `briefing_manage` | Medium | SQLite preferences overlay household.json defaults. Adults can opt in/out and set delivery hour via conversation. |
| Morning briefing + Trello tasks | not built | ❌ Not built | Not rolled out | Medium | Pull Lee + Kelly's Trello boards, fit actionable tasks into the day's schedule. Depends on Trello API integration. |
| Multi-person scheduling negotiation | not built | ❌ Not built | Not rolled out | High | Reasoning layer on top of freebusy |
| Task delegation + follow-up | `task_create`, `task_query`, `task_update` | ✅ Verified | Adults with `tasks`/`tasks_others` permissions | High | Assign/track/follow-up workflow across household members. Signal notifications on assignment and completion. |
| Current weather + forecast | `weather_query` | ✅ Verified | Open to all users | Medium | No key needed (NWS). Verified end-to-end on server |
| Weather permission policy documentation | `weather_query` | ✅ Verified | Open to all users | Low | Open-access policy is now documented in `permissions.js` comments |
| Outfit/departure guidance | not built | ❌ Not built | Not rolled out | Medium | Uses weather + calendar + routines |
| Severe weather alerts | not built | ❌ Not built | Not rolled out | Low | Proactive trigger infrastructure required |
| Daily departure checklist | not built | ❌ Not built | Not rolled out | Medium | Intended for front-door display and messaging |
| Anticipatory daily operations | not built | ❌ Not built | Not rolled out | High | Event-driven proactive nudges (weather/calendar/email context) |

### 2) 🏠 Property & Home

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Query home/device state | `ha_query` | ✅ Verified | All members with HA permissions | High | Uses HA REST API + token; EC2 reaches HA via Tailscale (`100.127.233.50`) |
| Control devices | `ha_control` | ✅ Verified | Adults/admin per permissions | High | Area-gated control path works; EC2 reaches HA via Tailscale (`100.127.233.50`) |
| HA area permission robustness | `ha_control` | ✅ Verified | Adults/admin | Medium | Commit `1cdf063`. Spec: `docs/specs/bugfix-hue-area-permissions.md`. Steve's permission-denied tests still pending. |
| Presence query ("who is home") | `ha_query` (`person.*`) | ✅ Verified | Adults with HA permissions | Medium | Works for members with presence configured (Lee, Steve, Hallie confirmed). Steve and Firen need to complete presence device setup. |
| Ambient automation (lights/blinds/climate) | not built | ❌ Not built | Not rolled out | Medium | Predecessor `claude-home-agent` (AppDaemon) disabled due to feedback loops, runaway API costs, and stateless oscillation. Revisit as Iji-native capability with: event batching, cost ceiling, action memory, opt-in scope. Code archived at `~/Projects/Home/claude-home-agent/`. |
| Scene/automation triggers | `ha_scene` (not built) | ❌ Not built | Not rolled out | Medium | Planned HA service tooling |
| Historical state analysis | `ha_history` (not built) | ❌ Not built | Not rolled out | Medium | Planned HA history endpoint tool |
| HA notification dispatch | `ha_notify` (not built) | ❌ Not built | Not rolled out | Low | Planned HA notify tools |
| Anomaly detection over sensors | not built | ❌ Not built | Not rolled out | Medium | Interpreted anomaly alerts (door/water/temp) |
| Presence inference engine | not built | ❌ Not built | Not rolled out | Medium | Probabilistic presence from multi-source signals |
| HA automation authoring | not built | ❌ Not built | Not rolled out | Medium | Draft/deploy automations with approval workflow |
| Camera/image understanding | not built | ❌ Not built | Not rolled out | Low | Doorbell/fridge/room context via vision inputs |
| Wall/room display intelligence layer | not built | ❌ Not built | Not rolled out | Low | Dynamic context output for room displays (hardware in `docs/hardware.md`) |
| Room tablets (Peninsula-style) | not built | ❌ Not built | Not rolled out | High | Fire tablets docked in every major room. Bedroom tablets: at-a-glance dashboard (lights, blinds, weather, calendar, music) + voice Iji interface. Common room tablets: lighting, sound, voice Iji. Room-local controls as default, whole-house lighting via popup or voice. Enables kids to control Hue colors without phones. Phase 1+2 combined: dashboard + voice Iji from day one. Prerequisite: voice channel for Iji (STT/TTS pipeline — HA Whisper/Piper or custom). Hardware: Fire HD 8/10 + docking station + USB power per room. Start with Ryker's bedroom. E-ink display repurposed for passive use (front door, kitchen). |
| Physical world orchestration | not built | ❌ Not built | Not rolled out | Low | Vacuum/sprinklers/laundry coordination from context |
| Maintenance/service log | `maintenance_log` (not built) | ❌ Not built | Not rolled out | Low | Appliance/service history |
| Contractor/vendor contacts | `contacts_search` (not built) | ❌ Not built | Not rolled out | Low | Address book + context by trade |
| Warranty tracking | not built | ❌ Not built | Not rolled out | Medium | Could integrate with asset registry |
| Service scheduling reminders | not built | ❌ Not built | Not rolled out | Medium | Seasonal + interval reminders |
| Grounds/landscape task tracking | not built | ❌ Not built | Not rolled out | Low | Linked to maintenance operations |
| Vendor coordination lifecycle | not built | ❌ Not built | Not rolled out | Low | Draft/follow-up coordination for contractors with human approval |
| Asset registry | not built | ❌ Not built | Not rolled out | Medium | Evaluate Homebox per Growth Protocol |
| Vehicle maintenance schedule | not built | ❌ Not built | Not rolled out | Medium | Recurring reminders + records |
| Registration/insurance tracking | not built | ❌ Not built | Not rolled out | Medium | Renewal reminders + document refs |
| Parking/charging logistics | not built | ❌ Not built | Not rolled out | Low | Coordination + reminder workflows |
| Transit directions | `transit_directions` (not built) | ❌ Not built | Not rolled out | Low | Google Maps API integration |
| Apple Find My item/device locate | `findmy_locate` (not built) | ❌ Not built | Not rolled out | Medium | Via FindMySync Mac app → HA device_tracker. See [FindMySync](https://github.com/MartinPham/FindMySync). Needs: app running on a household Mac, HA long-lived token, Accessibility permission. No Apple API key needed. |
| HA entity naming cleanup | Home Assistant / Hue | ❌ Not done | Not rolled out | Medium | Non-Iji housekeeping task. Multiple entity_id / friendly_name mismatches. Key offenders: `light.logan_bedside_lamp` → "Living Room Floor Lamp 1", `light.avalon_master_bedroom_status_light` → "Avalon Basement", `light.train_station_*` → still says train station (now Basement TV Room), `light.hallie_office` → entity says office but it's a bedroom, 4× generic `hue_ambiance_downlight_*` in Logan's closet, 7× WiZ bulbs in foyer with null friendly_names. Fix in HA entity registry and/or Hue app directly. Not blocking Iji — area registry is source of truth — but confusing for humans browsing HA and for Claude when friendly names contradict area assignments. |

### 3) 💰 Finances

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Query transactions | `finance_transactions` | ✅ Verified | Lee only (`financial` permission) | High | Verified on EC2 with current Monarch auth/session setup |
| Payback ledger visibility | `finance_paybacks` | ✅ Verified | Lee only (`financial`) | High | Verified expected behavior: returns "not configured" when state file is absent; no hardcoded Mac path |
| Account balances snapshot | `finance_accounts` | ✅ Verified | Lee only (`financial`) | High | Phase 1 Finances capability. Wraps `monarch.getAccounts()`. Spec: `specs/finances/FINANCES-CAPABILITY.md`. Code reviewed, registered in tool index, added to health check. |
| Budget tracking by category | `finance_budget_summary` | ✅ Verified | Lee only (`financial`) | High | Phase 1 Finances capability. New `getBudgets()` GraphQL query. Spec: `specs/finances/FINANCES-CAPABILITY.md`. Code reviewed, registered in tool index, added to health check. |
| Financial reasoning (prompt) | system prompt | ✅ Verified | Lee only (`financial`) | High | Phase 1. Capability prompt at `config/prompts/capabilities/finance.md` with tax context, equity withholding reasoning, advisor tone. |
| Bill due reminders | not built | ❌ Not built | Not rolled out | Low | Proactive feature from status/backlog |

### 4) 👥 People & Relationships

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Guest list and visitor profiles | not built | ❌ Not built | Not rolled out | Low | Frequent visitor + context memory |
| Event planning checklists | not built | ❌ Not built | Not rolled out | Low | Could use document-generation capability |
| Guest room readiness workflow | not built | ❌ Not built | Not rolled out | Low | Crosses home ops + inventory |
| Social obligation tracking (RSVP/gifts) | not built | ❌ Not built | Not rolled out | Low | Correspondence + reminders |
| Relationship graph | not built | ❌ Not built | Not rolled out | Medium | Evaluate Monica per Growth Protocol |

### 5) 🛒 Procurement & Errands

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Safeway staples list management | `safeway_list` (not built) | ❌ Not built | Not rolled out | High | Shared list + approval model |
| Skip recurring delivery | `safeway_skip` (not built) | ❌ Not built | Not rolled out | High | Needs reverse-engineered Safeway API |
| Sync staples to Safeway order | `safeway_order` (not built) | ❌ Not built | Not rolled out | High | Depends on auth/session stability |
| Package/delivery tracking | not built | ❌ Not built | Not rolled out | Medium | Parse email + carrier tracking |
| Proactive restocking recommendations | not built | ❌ Not built | Not rolled out | Medium | Inventory + spend pattern intelligence |
| Meal planning + grocery coordination intelligence | not built | ❌ Not built | Not rolled out | Medium | Dietary preferences + purchase patterns into plan suggestions |

### 6) 👨‍🍳 Meals & Kitchen

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Recipe memory + ratings | `meals_recipes` (not built) | ❌ Not built | Not rolled out | High | Seed from Firen's spreadsheet |
| Weekly menu management | `meals_menu` (not built) | ❌ Not built | Not rolled out | High | Chef proposal + household feedback cycle |
| Post-meal feedback capture | `meals_feedback` (not built) | ❌ Not built | Not rolled out | Medium | Depends on outreach + recipe DB |
| Chef communication automation | not built | ❌ Not built | Not rolled out | High | SMS channel (Twilio) is prerequisite |
| Kitchen inventory + meal ops | not built | ❌ Not built | Not rolled out | Medium | Extend into pantry/inventory tracking |

### 7) 👶 Children

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| AM/PM routine tracking | not built | ❌ Not built | Not rolled out | High | Depends on HA/ESPHome routine hardware flow |
| School/activity schedule assistant | not built | ❌ Not built | Not rolled out | High | Calendar + reminders + coordination |
| Medical/permission-slip tracking | not built | ❌ Not built | Not rolled out | Medium | Structured records + reminders needed |
| Homework tracking support | not built | ❌ Not built | Not rolled out | Medium | Child-focused workflow not yet implemented |

---

## Engine

### 💬 Communication

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Signal inbound/outbound assistant | `src/broker/signal.js`, `src/router/signal.js` | ✅ Verified | Household on Signal | High | Core channel working in production |
| Relay/announce to people and groups | `message_send` | ✅ Verified | Adults (`message_send`) | High | Uses Signal + group registry (`signal_groups`) |
| Delivery confirmation correctness | `message_send` | ✅ Verified | Adults | High | Tool now returns send failure when Signal TCP client is unavailable |
| SMS channel for non-Signal contacts | `sms_send` | ⚠️ Deployed, awaiting Twilio verification | Lee first, then rollout | High | Twilio REST API (no SDK). External contacts registry in `config/contacts.json`. Toll-free number purchased, awaiting carrier verification (1-3 business days). Spec: `specs/SMS-SEND.md`. Decision: `docs/decisions/2026-02-26-outbound-comms-rollout.md`. |
| Search Gmail | `email_search` | ✅ Verified | Lee only (OAuth token currently present) | High | Verified for Lee; other adults require their own OAuth token setup |
| Read full Gmail message/thread | `email_read` | ✅ Verified | Lee only (OAuth token currently present) | High | Verified for Lee; other adults require their own OAuth token setup |
| Send email on behalf of user | `email_send` | ✅ Verified | Lee first, then rollout | High | Spec: `specs/EMAIL-SEND.md`. Requires gmail.send scope + re-auth. Decision: `docs/decisions/2026-02-26-outbound-comms-rollout.md`. Rollout template: `docs/templates/rollout.md` |
| Slack channel adapter | not built | ❌ Not built | Not rolled out | Medium | Architecture supports it; implementation pending. Prerequisite for Finances capability across all channels (currently Signal + CLI only). |
| Slack message search | `slack_search` (not built) | ❌ Not built | Not rolled out | Medium | Needs Slack API integration + auth |
| Email as a channel (inbound/outbound) | not built | ❌ Not built | Not rolled out | Medium | Distinct from Gmail search/read tools |
| Voice channel adapter | not built | ❌ Not built | Not rolled out | High | Wyoming/STT/TTS path documented in architecture. Prerequisite for room tablets (Peninsula-style). Needs: STT (Whisper local or HA pipeline), TTS (Piper), wake word or push-to-talk, bridge to Iji brain. Either Iji becomes an HA conversation agent or tablets run custom voice UI hitting Iji API directly. |
| Draft email for review | `email_draft` (not built) | ❌ Not built | Not rolled out | Medium | Requires Gmail modify scope + per-user OAuth |
| Search shared Drive docs | `docs_search` (not built) | ❌ Not built | Not rolled out | Low | Needs Drive API tool |
| Read Google Docs content | `docs_read` (not built) | ❌ Not built | Not rolled out | Low | Needs Drive/Docs read tools |
| Weekly family-doc sync | `scripts/sync-docs-to-gdoc.js` | ⚠️ Untested | Not rolled out | Low | Script works (doc was created successfully). Cron job status on EC2 unknown. Paused — v2 needs rethinking around purpose (originally: promote Iji capabilities to household without Lee having to talk about it). |
| Generate operational documents | not built | ❌ Not built | Not rolled out | Medium | Packing lists, summaries, prep docs, reports |

### 🧠 Memory

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

### 🔧 Infrastructure

| Capability | Tools | Status | Rollout | Priority | Notes |
|-----------|-------|--------|---------|----------|-------|
| Cost telemetry query | `cost_query` | ✅ Verified | Lee only (`financial`) | Medium | Reads `claude_usage` in SQLite. Useful for governance and budget checks |
| Secret synchronization hygiene | `docs/ops/secrets.md` | ✅ Verified | Not rolled out | High | Runbook at `docs/ops/secrets.md`. Deploy preflight checks required files. `.env.example` audited complete. New-instance checklist included. |
| Environment template completeness | not built | ✅ Verified | Not rolled out | Medium | `.env.example` now documents required/optional runtime env vars |
| Daily automated health checks | `scripts/health-check.js` | ✅ Verified | Lee only alerts | High | Cron installed on EC2 (daily 7:05 AM UTC). STATUS.md written, DMs Lee on failure. Runbook: `docs/ops/health-check.md`. Operationalized in commit `9f8aab6`. |
| Conversation eval logging (prompt optimization phase 1) | `conversation_evals`, `src/utils/eval-logger.js` | ✅ Verified | Not rolled out | Medium | Logs completed brain loops with tools/tokens/cost/latency (commit `a7751fc`) |
| Security hardening wave | not built | ❌ Not built | Not rolled out | Medium | Scope audits, key rotation, access review, abuse controls |
| Web search capability | `web_search` (not built) | ❌ Not built | Not rolled out | Medium | Evaluate Brave/Tavily/SerpAPI |
| Tool authoring (self-extension) | not built | ❌ Not built | Not rolled out | Low | Meta-cognitive capability |
| Confidence calibration | not built | ❌ Not built | Not rolled out | Medium | Staleness-aware confidence outputs |
| Escalation intelligence | not built | ❌ Not built | Not rolled out | Medium | Autonomy boundary learning |
| Conversation quality self-review | not built | ❌ Not built | Not rolled out | Low | Follow-up quality checks |
| Context file audit | `ARCHITECTURE.md`, `.cursorrules`, `DEV-PROTOCOL.md` | ✅ Verified | Not rolled out | High | Completed via `specs/CONTEXT-AUDIT.md` (commit `48fbd5a`). Decision: `docs/decisions/2026-02-25-context-audit.md` |
| Layered context architecture | `src/brain/prompt.js`, `config/prompts/` | ✅ Verified | Not rolled out | High | Phase 1+2 shipped and verified in production (`055ecab`, `8846e8e`): split prompt + intent-based selective loading. Phase 3 (token measurement) still pending as separate item. Decision: `docs/decisions/2026-02-25-layered-context.md` |
| Prompt optimization loop | `scripts/eval-conversations.js`, `scripts/optimize-prompt.js` | ✅ Verified | Not rolled out | Medium | Step 1 shipped and verified (conversation_evals table + logger, used for briefing dedup). Batch eval script + optimizer still pending. Decision: `docs/decisions/2026-02-25-prompt-optimization.md` |
| Tailscale CI/CD migration | `.github/workflows/deploy.yml`, `scripts/*.sh` | ✅ Verified | Not rolled out | **Critical** | Completed: deploy workflow and manual scripts now default to Tailscale host (`100.124.0.46`). Spec: `specs/INFRA-RELIABILITY.md`. Decision: `docs/decisions/2026-02-25-infra-reliability.md` |
| Elastic IP allocation | AWS infrastructure | ✅ Verified | Not rolled out | High | Allocated and associated (`13.58.219.0`) for stable public endpoint fallback. |
| AMI snapshot + recovery | AWS infrastructure | ⚠️ Untested | Not rolled out | High | Baseline AMI created (`ami-0650bb542852313f9`); restore drill not yet exercised. |
| Provision script (documentation) | `scripts/provision-instance.sh` | ✅ Verified | Not rolled out | Medium | Added reference inventory script for EC2 baseline/provisioning documentation. |
| Feature request intake | `feature_request`, `feature_request_list`, `feature_request_triage` | ✅ Verified | All adults can submit; Lee triages | Medium | Submit (default allow), list + triage (admin only). Morning briefing shows pending count for admin. Spec: `specs/FEATURE-REQUESTS.md`. |

---

## Suggested Build Order

### Wave A — Stabilize Operations & Reliability
1. Secret synchronization hygiene (gitignored server secrets/process hardening).
2. Daily health checks operationalization (cron + alert validation + runbook).
3. Run AMI recovery drill from `ami-0650bb542852313f9` and document timings.
4. Finish layered context phase 3 (token measurement by layer).

### Wave B — Scheduling & Logistics Depth
5. Morning briefing opt-in/out controls (config + UX).
6. Morning briefing + Trello task integration.
7. Household conflict detection and multi-person scheduling negotiation.
8. ~~Task delegation workflow (`task_create`, `task_query`, `task_update`).~~ ✅ Shipped.

### Wave C — Communication Engine Expansion
9. Gmail `email_draft` + OAuth rollout to adults. (`email_send` shipped.)
10. Slack channel adapter. (SMS deployed, awaiting Twilio verification.)
11. Drive tools (`docs_search`, `docs_read`) and document generation flows.

### Wave D — Sphere Build-Out
12. Property & Home tool expansion (`ha_history`, `ha_scene`, `ha_notify`) and presence productization.
13. Meals & Kitchen stack (`meals_recipes`, `meals_menu`, `meals_feedback`) + chef workflow.
14. Procurement & Errands stack (`safeway_list`, `safeway_skip`, `safeway_order`).
15. Property maintenance + vehicles foundations (`maintenance_log`, vendor contacts, vehicle workflows).

### Wave E — Intelligence Layers
16. Situational awareness stack (passive extraction, anomaly detection, presence inference, deliveries, Find My).
17. Prompt optimization phase 2+ (weekly eval script + monthly optimizer loop).
18. Memory upgrades (preferences, routines, forgetting curves, decision log).
