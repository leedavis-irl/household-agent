# Iji Tool Inventory & Backlog

## Naming Convention

**Pattern: `domain_action`**

Domain first so tools group naturally in sorted lists. File names use kebab-case matching the domain: `ha-control.js`, `calendar-query.js`, `finance-transactions.js`.

Examples: `ha_control`, `calendar_query`, `finance_transactions`, `list_modify`, `email_search`

---

## Active Tools

| Tool | File | Status | Notes |
|------|------|--------|-------|
| `knowledge_search` | knowledge-search.js | ✅ Working | SQLite LIKE search with expiry filtering |
| `knowledge_store` | knowledge-store.js | ✅ Working | Tags, expiry, reporter attribution |
| `ha_query` | ha-query.js | ✅ Working | Queries HA REST API, filters by entity or domain |
| `ha_control` | ha-control.js | ✅ Working | Calls HA services with area-based permission checks |
| `calendar_query` | calendar.js | ✅ Working | Queries Google Calendar via service account. Reads calendar IDs from household.json. |
| `calendar_create` | calendar-create.js | ✅ Working | Create events on a member's calendar. calendar_own or calendar_all. Read-only calendar returns clear error. |
| `calendar_modify` | calendar-modify.js | ✅ Working | Reschedule, update, or cancel events (by event_id or event_summary + date). Same permission/read-only handling as create. |
| `calendar_freebusy` | calendar-freebusy.js | ✅ Working | Free/busy across multiple people; returns overlapping free slots. calendar_household or calendar_all. Unconnected calendars noted. |
| `message_send` | message-send.js | ✅ Working | Send Signal to household members or groups. Relay ("tell Steve …"), announcements. Group names from registry (seed: Avalon Logistics). Adults only. |

---

## Hardware Prerequisites

Physical infrastructure projects that aren't Iji tools but are prerequisites for Iji to work reliably or enable future capabilities.

### 🔌 Shelly Switch Retrofit

**Problem:** Hue bulbs lose power (and Iji loses control) when someone flips a physical wall switch to the off position. This is the #1 reliability gap in home automation.

**Solution:** Shelly 1PM Mini Gen4 relays behind each Buster + Punch toggle switch, wired in detached mode. The Shelly keeps power flowing to the Hue bulbs permanently and fires an event to Home Assistant when the toggle is flipped. HA then tells Hue to toggle. Physical switches still work as expected, but bulbs never lose power.

**Status:** Hardware purchased, installation pending.

| Item | Status | Notes |
|------|--------|-------|
| 10x Shelly 1PM Mini Gen4 | ✅ Purchased | [amazon.com/dp/B0FPMMC9XG](https://www.amazon.com/Shelly-Zigbee-Matter-Metering-1-Channel/dp/B0FPMMC9XG) ~$15 each |
| Wago 221 lever connector kit (105pc) | ✅ Purchased | [amazon.com/dp/B0C6R2J52C](https://www.amazon.com/Lever-Nuts-Connector-Assortment-221-412-221-2401/dp/B0C6R2J52C) |
| 14 AWG solid THHN pigtail wire (black) | ❌ Need to buy | THE CIMPLE CO, 10ft, 14 AWG solid copper THHN, black — same listing as white below, select Black color variant |
| 14 AWG solid THHN pigtail wire (white) | ❌ Need to buy | THE CIMPLE CO, 10ft, 14 AWG solid copper THHN, white — [amazon.com/dp/B07J9L6JD3](https://www.amazon.com/Feet-Meter-Residential-Commerical-Industrial/dp/B07J9L6JD3) |
| Wire strippers + voltage tester | ✅ Have | From house rewire |

**Pigtail wire:** You need short (~6") jumper wires to bridge between the Wago connectors and the Shelly terminals inside each switch box. Cut from the 10ft spools, strip both ends. 10ft of each color is enough for ~20 switches. Black = hot/line, white = neutral.

**Installation:** ~15 min per switch once you've done the first one. Start with highest-traffic rooms (living room, kitchen, family room, stairwell). An electrician could do the whole initial batch in half a day. Wire strippers and a voltage tester are the only tools needed.

**HA config after install:** Set each Shelly to detached mode. Create automations mapping each Shelly toggle event to the corresponding Hue light group.

**Prerequisite for:** Reliable `ha_control` of lights, room display panels (controlling lights from a wall display is pointless if someone can cut power by flipping a switch).

### 🖥️ Room Display Panels ("Physical Iji")

**Concept:** Small touchscreen or e-ink displays in each major room that surface room-specific information and allow local adjustments. Each room's display is tailored to that room's function and occupant(s).

**Example configurations:**

- **Living room:** Light controls, Sonos speaker controls, current weather, household calendar highlights
- **Bedrooms:** Light/blind controls, weather, the room owner's calendar for today, wake-up alarm status
- **Kitchen:** Meal plan for the day, grocery list status, Lisa's upcoming visit, weather
- **Kids' rooms:** AM/PM routine status (see Kids' Routine Displays below), next-day schedule
- **Front door:** Departure checklist, weather, "who's home" status, next household event

**Architecture:** These are HA dashboards (Bubble Card based) served on wall-mounted tablets or e-ink displays, with Iji providing the data layer. Iji surfaces context-aware information via HA entities and sensors; the displays render it. This is a parallel track to Iji software development — it depends on having a solid HA admin dashboard first, then extracting per-room views from it.

**Hardware options:**
- Color e-ink displays (ESP32 + Waveshare) — always-on, low power, clean look, slow refresh
- Cheap tablets (Fire tablets, old phones) — color, interactive, faster, needs constant power
- 1x e-ink display available now, earmarked for first prototype

**Status:** Design phase. Admin HA dashboard (Bubble Cards) is being iterated on. Room views will be extracted from that.

**Prerequisite for:** Iji becoming a physical presence in the home, not just a chat interface. Shelly switch retrofit should be done first (no point showing light controls on a display if someone can cut power at the switch).

### 📋 Kids' AM/PM Routine Displays

**Concept:** Dedicated display(s) for Ryker and Logan's daily routines. Physical buttons (Seeed XIAO ESP32-C6) placed at task locations (bathroom, laundry chute, kitchen, pill station) that the kids press when they complete each task. A command center e-ink display at the front door shows completion status. Signal/Slack reports sent to adults.

**This is an HA/ESPHome project, not an Iji feature.** It runs entirely within Home Assistant — buttons → automations → display + notifications. Iji may eventually query or surface this data, but the system operates independently.

**Status:** Designed but not built. Hardware (Seeed buttons) not yet purchased. See past chat sessions for full task list design (laundry, teeth, plates, pills, trumpet).

---

## Backlog

### 🏠 Home Automation

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `ha_history` | "When was the front door last opened?" "How long were the lights on?" Query entity state history. | Bolt-on — HA REST API `/api/history/period` | Medium |
| `ha_scene` | Trigger scenes and automations. "Movie mode." "Goodnight." | Bolt-on — HA service call `scene.turn_on`, `automation.trigger` | Medium |
| `ha_notify` | Push notifications through HA (phones, speakers). "Announce dinner's ready." | Bolt-on — HA `notify.*` services | Low |

### 📬 Communication

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `email_search` | Search Gmail for receipts, confirmations, threads. | Bolt-on — Gmail API `messages.list` with query | High |
| `email_read` | Read a specific email/thread for details. | Bolt-on — Gmail API `messages.get` | High (paired with search) |
| `email_send` | Send email on someone's behalf. | Bolt-on — Gmail API `messages.send` | Medium |
| `email_draft` | Compose a draft for review. Safer than send. | Bolt-on — Gmail API `drafts.create` | Medium |
| `slack_search` | Search household Slack channels for context. | Bolt-on — Slack Web API `search.messages` | Medium |

### 💰 Finance

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `finance_transactions` | Query recent transactions. "What did we spend at Costco this month?" | Bolt-on — Monarch Money API (you have a working Python client) | High |
| `finance_balances` | Account balances and net worth snapshot. | Bolt-on — Monarch Money API | Medium |
| `finance_paybacks` | "Who owes what?" Adult Pay Backs ledger. | Hybrid — Monarch API + your existing tracking logic | High |
| `finance_budget` | Budget status by category. "How are we doing on dining out?" | Bolt-on — Monarch Money API | Medium |

### 👨‍🍳 Chef & Meal Planning

**Overview:** Iji manages the relationship with Lisa, the household chef who comes every Wednesday. Firen is currently the primary liaison.

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `meals_recipes` | Read/write the household recipe list — dishes Lisa has made, ratings, dietary tags, family preferences. | Build — SQLite table, seeded from Firen's existing Excel list | High |
| `meals_menu` | Manage the weekly menu. Receive Lisa's proposals, confirm against dietary preferences, solicit household feedback. | Build — uses recipe list + knowledge store | High |
| `meals_feedback` | After a meal, ask the household what they thought. Log ratings and notes back to the recipe list. | Build — proactive outreach via message_send + recipe store | Medium |

**How it works today:** Lisa proposes 4 mains + 4 sides, Firen confirms by Sunday evening. Firen keeps an Excel spreadsheet of dishes the family likes. Communication is via SMS group text.

**What Iji does:**
- Owns the recipe/preference database (migrated from Firen's Excel list).
- When Lisa proposes a menu, Iji checks against known dietary preferences and family favorites.
- Iji can suggest dishes from the favorites list to Lisa (the family doesn't mind repeats of things they love).
- After new dishes, Iji solicits feedback from the household and logs it.
- Iji can proactively surface the menu to the household ("Lisa is making X, Y, Z this Wednesday").

**Communication gap:** Lisa communicates via SMS, not Signal. Iji needs an SMS channel (Twilio) to message Lisa directly. Until then, Iji assists Firen who relays via text.

**Prerequisite:** SMS channel adapter (Twilio) for direct Lisa communication. Import Firen's Excel list into SQLite.

### 🛒 Safeway Staples Order

**Overview:** Iji manages the household's recurring Safeway grocery delivery (Safeway.com). Delivery is every Sunday unless skipped.

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `safeway_list` | Read/modify the master staples list. Add or remove items that are considered staples. | Build — SQLite table for the master list | High |
| `safeway_skip` | Skip the next delivery (e.g., family is out of town). | Bolt-on — Safeway.com API (reverse-engineered) | High |
| `safeway_order` | Sync the master staples list to the actual Safeway cart/recurring order. | Bolt-on — Safeway.com API (reverse-engineered) | High |

**How it works today:** Recurring Safeway.com delivery every Sunday with a standard staples list. Manual login to modify.

**What Iji does:**
- Owns the master staples list. Any household adult can ask Iji to add or remove items.
- Knows what's in the current order.
- Skips delivery when the family is out of town (Iji can infer this from calendar or be told directly).
- Proactively asks the household to review the staples list periodically — "Anything to add or drop from the Safeway order this week?"
- Syncs changes to the actual Safeway order.

**Technical approach:** Reverse-engineer Safeway.com's internal APIs (same strategy as Monarch Money). Sniff cart management, order scheduling, and skip/pause endpoints via browser devtools. Auth will likely be session-cookie-based and fragile. Build an unofficial Safeway client as a standalone module, then wrap as Iji tools.

**Prerequisite:** Reverse-engineer Safeway.com API — standalone spike before building tools.

### 🌤️ Weather

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `weather_query` | Current conditions + forecast. "Do I need a jacket?" "Will it rain at the soccer game Saturday?" | Bolt-on — OpenWeatherMap API (free tier) or NWS API (free, no key) | Medium |

### 🔍 Search & Information

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `web_search` | General web search for anything Iji can't answer from household data. | Bolt-on — Brave Search API ($0, 2000 queries/mo free) or Google Custom Search | Medium |
| `docs_search` | Search shared Google Drive for household documents. | Bolt-on — Google Drive API `files.list` with query | Low |
| `docs_read` | Read content of a specific Google Doc. | Bolt-on — Google Docs API `documents.get` | Low |

### ⏰ Reminders & Timers

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `reminder_set` | "Remind me to call the dentist tomorrow at 10am." "Remind Steve to move the car before street sweeping." | Build — scheduler + SQLite table + cron check | High |
| `reminder_list` | "What reminders do I have?" | Build — query reminder table | High (paired) |

**Requires infrastructure:** A scheduler loop that checks for due reminders and sends messages through the appropriate channel. Not just a tool — needs a background process or cron job.

### 🏗️ Property & Maintenance

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `maintenance_log` | Track repairs, service visits, warranties, contractor contacts. "When was the furnace last serviced?" "What's the warranty on the dishwasher?" | Build — SQLite table | Low |
| `contacts_search` | Household address book — service providers, schools, doctors, neighbors. | Build — SQLite table or extend knowledge store | Low |

### 🗺️ Transportation

| Tool | What it does | Build vs bolt-on | Priority |
|------|-------------|-------------------|----------|
| `transit_directions` | "How long to get to SFO right now?" "Best route to school?" | Bolt-on — Google Maps Directions API | Low |
| `location_query` | "Who's home?" "Is Steve at work?" | Already covered — `ha_query` with `person.*` entities | N/A |

### 📢 Proactive (not tools — infrastructure)

These aren't tools Claude calls. They're scheduled triggers that invoke the brain loop on a timer.

| Feature | What it does | Priority |
|---------|-------------|----------|
| Morning briefing | Daily summary: weather, today's calendar, open reminders, anything stored yesterday | High |
| Calendar reminders | "You have a meeting in 30 minutes" | Medium |
| Weather alerts | "Rain expected during River's soccer game Saturday" | Low |
| Bill reminders | "PG&E due in 3 days" | Low |
| Maintenance reminders | "Furnace filter due for replacement (last changed 90 days ago)" | Low |

---

### 👁️ Situational Awareness

Iji stops being reactive and starts noticing things.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Passive group chat absorption | Listen to Signal/Slack groups without being @-mentioned. Extract and store facts ("Steve said he's picking up the kids at 3"). Secondary brain call with focused extraction prompt. Requires household privacy discussion before enabling. | 🔧🧠 Build | High |
| Anomaly detection on HA data | Watch sensor history, flag unusual patterns. Door open at 3am. Water usage spike (Moen Flo). Temp diverging from setpoint. Not just alerts — *interpreted* alerts with context ("Garage door open 2 hours; Steve left at noon and hasn't returned"). | 🔧🧠 Build | Medium |
| Presence inference engine | Go beyond HA binary presence. Combine phone pings, door sensors, calendar events, recent messages for probabilistic model of who's home, who's awake, who's arriving soon. Tools: `presence_query`, `presence_history`. | 🔧🧠 Build | Medium |
| Package & delivery tracking | Parse email confirmations, track across carriers, announce arrivals. Correlate with doorbell events. | 🔌🧠 Integrate — evaluate per Growth Protocol | Medium |
| AirTag / FindMy tracking | Query Apple FindMy for AirTagged items: keys, backpacks, vehicles. "Where are the car keys?" "Where's Logan's backpack?" Feeds into presence inference engine. | 🔌🧠 Integrate — pyicloud or reverse-engineered FindMy lib. Apple 2FA is the auth complexity risk. | Medium |

### 🤝 Household Coordination Engine

Iji becomes the scheduling and logistics brain.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Multi-person scheduling negotiation | "Find a time when Lee, Steve, and Dana are all free for dinner this week." FreeBusy is the primitive; this is the reasoning layer that factors in preferences, proposes options, handles back-and-forth. | 🧠 Brain | High |
| Task delegation & follow-up | Iji assigns a task ("Steve, can you call the plumber before Thursday?"), tracks it, follows up if not done. Tools: `task_create`, `task_query`, `task_update`. | 🔧🧠 Build | High |
| Conflict detection | Proactively notice logistics problems: both adults away with no kid pickup arranged, two events need the same car, overlapping commitments. | 🧠 Brain | Medium |
| Meal planning & grocery coordination | Track dietary preferences/restrictions per person, suggest meal plans, generate grocery lists. Cross-reference purchase history from Monarch for "running low" estimates. Extends existing Chef tools. | 🔧🧠 Build | Medium |

### 🧬 Learning & Preference Modeling

Iji develops a theory of mind for each household member.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Individual preference profiles | Learned, not configured. Lee likes 69°. Steve prefers the office warmer. Dana always forgets the garage door. Built from observation, stored as structured knowledge with confidence scores. | 🔧🧠 Build | Medium |
| Routine detection | Identify recurring patterns (every Tuesday Lee picks up kids at 3:15, Steve works late Thursdays). Use for prediction without explicit instruction. Batch job over stored data. | 🔧🧠 Build | Medium |
| Feedback loops | Track whether suggestions/actions were accepted, rejected, or modified. Calibrate future behavior. "I notice you always override my thermostat suggestion — should I adjust my default?" | 🔧🧠 Build | Low |
| Forgetting curves | Knowledge decay with TTL tiers. "Dinner is tacos at 7" = hours. "Plumber's number" = months. "Lee is allergic to shellfish" = permanent. Confidence decay and expiry tiers. | 🔧🧠 Build | Medium |

### 🚀 Autonomous Operations

Iji starts doing things without being asked.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Anticipatory actions | Rain + windows open → alert. Flight lands at 4pm + traffic bad → suggest leaving at 2:30. School closure in email → flag tonight. Cron or event-driven trigger that asks Claude "anything worth flagging?" | 🧠 Brain | High |
| Automation authoring | Iji writes and deploys HA automations via REST API. Proposes automation, you approve, Iji deploys. Safety model: what's Iji allowed to create without approval? | 🔧🧠 Build | Medium |
| Vendor coordination | Draft emails to contractors, follow up on quotes, track who's scheduled for what. You approve outbound messages; Iji handles the lifecycle. | 🧠 Brain | Low |
| Document generation | Produce household documents: packing lists, event prep checklists, meeting summaries, expense reports from Monarch data. | 🔧 Build | Medium |

### 🎙️ Multi-Modal & Embodied

Iji gets eyes, ears, and a voice.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Voice interface | Channel adapter for smart speaker or always-on mic. STT → Claude → TTS. The actual Jarvis moment. | 🔌🔧 Integrate + Build — evaluate STT/TTS/wake-word per Growth Protocol | Low |
| Camera/image understanding | "What's in the fridge?" → photo → Claude vision. "Is someone at the door?" → doorbell feed. | 🔌🧠 Integrate | Low |
| Wall displays | Context-aware dashboards on wall-mounted tablets. Not static HA dashboards — dynamic displays showing what's most relevant right now. Morning: schedule + weather. Evening: dinner plan + who's home. | 🔧 Build | Low |
| Physical world integration | Robot vacuum scheduling from activity patterns. Sprinkler coordination with weather. Laundry reminders from washer/dryer power monitoring. | 🔧🧠 Build | Low |

### 🧠 Meta-Cognition & Self-Improvement

Iji reasons about its own capabilities and limitations.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Tool authoring | When Iji can't fulfill a request, it proposes a new tool spec, writes the implementation, submits for review. "I don't have a BART delay tool, but I could build one. Want me to draft it?" | 🔧🧠 Build | Low |
| Confidence calibration | Track own accuracy. When answering from knowledge, report staleness. "I'm 60% sure" instead of false certainty. | 🧠 Brain | Medium |
| Escalation intelligence | Learn what to handle autonomously vs. escalate. Medical → always escalate. Porch light → just do it. Boundary learned from interaction patterns. | 🧠 Brain | Medium |
| Conversation quality self-assessment | After multi-turn interactions, evaluate whether the person got what they needed. Follow up if not. "Steve, I wasn't sure my insurance answer was right — did you find what you needed?" | 🧠 Brain | Low |

### 🕸️ Household Knowledge Graph

Iji builds a structured model of the household as an entity.

| Capability | What it does | Build type | Priority |
|-----------|-------------|------------|----------|
| Relationship graph | Full social graph: extended family, kids' friends' parents, contractors, doctors, teachers. Contact info, last interaction, context. | 🔧 Build — evaluate Monica (self-hosted personal CRM) per Growth Protocol | Medium |
| Asset & maintenance registry | Every major appliance: purchase date, warranty, maintenance history, vendors. "When was the dishwasher last serviced?" | 🔧 Build — evaluate Homebox (self-hosted home inventory) per Growth Protocol | Medium |
| Institutional procedures | "How do we handle a plumbing emergency?" "Process for booking the Tahoe cabin?" Runbooks for recurring household operations, built from how things actually get done. | 🔧🧠 Build | Low |
| Decision log | Record major household decisions with context and rationale. "We switched to Recology in March 2025 because..." Searchable institutional memory. | 🔧 Build | Low |

---

## Bolt-On Integration Map

Services the household already uses or has access to, mapped to which tools they power:

| Service | API | Tools it powers | Auth |
|---------|-----|-----------------|------|
| Home Assistant | REST API | `ha_*` | Long-lived access token |
| Google Calendar | Calendar API v3 | `calendar_*` | Service account or OAuth |
| Gmail | Gmail API v1 | `email_*` | OAuth (per-user) |
| Google Drive | Drive API v3 | `docs_*` | OAuth or service account |
| Monarch Money | Unofficial Python API | `finance_*` | Session cookie (fragile) |
| Slack | Web API + Bolt | `slack_search`, channel adapter | Bot token |
| Signal | signal-cli JSON-RPC | `message_send`, channel adapter | Registered account |
| OpenWeatherMap | REST API | `weather_query` | Free API key |
| Brave Search | REST API | `web_search` | Free API key |
| Google Maps | Directions API | `transit_directions` | API key (pay-per-use) |
| Safeway | Unofficial REST API (reverse-engineered) | `safeway_*` | Session cookie (fragile) |

### Auth complexity notes

- **Easy (API key or token):** HA, OpenWeatherMap, Brave Search, Google Maps
- **Medium (service account):** Google Calendar (full read/write; household calendars must be shared with the service account)
- **Hard (per-user OAuth):** Gmail, Google Drive (each person needs to authorize Iji to access their account)
- **Fragile (reverse-engineered):** Monarch Money, Safeway (session-based auth, may break with updates — you've already dealt with this for Monarch)

---

## Suggested Build Order

Sequenced by: impact × ease, with infrastructure dependencies noted.

**Build type key:**
- 🔧 **Build** — Custom code, no external product
- 🔌 **Integrate** — Wrap an existing API/service as a tool (evaluate per Growth Protocol)
- 🧠 **Brain** — Primarily prompt engineering + reasoning logic, minimal new code

### Wave 1: Complete the Core Loop ✅
1. ✅ Rename tools to `domain_action` convention
2. ✅ Finish `calendar_query` config — get Google Calendar actually working

### Wave 2: Read the Outside World
3. 🔌 **`email_search` + `email_read`** — Gmail integration. OAuth is the hard part; once done, search is trivial.
4. 🔌 **`finance_transactions` + `finance_paybacks`** — Wrap existing Monarch Python client as a tool (or port key queries to Node).
5. 🔌 **`weather_query`** — NWS or OpenWeatherMap. One API call, huge quality-of-life.

### Wave 3: Proactive Iji
6. 🔧 **Reminder infrastructure** — Scheduler loop + `reminder_set` + `reminder_list`
7. 🔧🧠 **Morning briefing** — Cron trigger that sends a daily summary to Signal. Brain decides what's worth mentioning.
8. 🔌 **`web_search`** — Evaluate Brave, Tavily, SerpAPI per Growth Protocol.

### Wave 4: Full Jarvis (Write Access)
9. 🔌 **`email_send` + `email_draft`** — Write access to Gmail
10. 🔌 **`ha_history` + `ha_scene`** — Deeper HA integration via REST API
11. 🔌 **`slack_search`** — Search household Slack for context
12. 🔌 **`docs_search` + `docs_read`** — Google Drive integration
13. 🔧 **`maintenance_log` + `contacts_search`** — Household operational data (evaluate Monica, Homebox per Growth Protocol)
14. 🔌 **`transit_directions`** — Google Maps Directions API
15. 🔧 **Chef & meal tools** — `meals_recipes`, `meals_menu`, `meals_feedback`
16. 🔧🔌 **Safeway tools** — `safeway_list`, `safeway_skip`, `safeway_order` (reverse-engineered API)

### Wave 4b: New Channel Adapters

More front doors to the same brain.

18. 🔌 **SMS channel adapter** — Twilio or equivalent. Enables communication with non-Signal contacts (Lisa the chef, contractors, schools). Moved up from Wave 4 item 17 because it unblocks the Chef workflow.
19. 🔌 **Email channel adapter** — Iji receives email at a dedicated address (e.g., iji@[household-domain]) and responds via email. Different from `email_search`/`email_read` (which search a person's inbox as a tool). This is email as a *communication channel* — the same way Signal is a channel. Inbound via Gmail API push notifications or polling. Outbound via Gmail API send. Useful for: receiving school notifications, contractor quotes, automated alerts that Iji should parse and act on.
20. 🔧🔌 **Voice channel adapter** — Physical voice interface in living room, kitchen, etc. See `docs/voice-hardware-analysis.md` for hardware options and architecture. The key architectural decision: use HA's Wyoming protocol for audio transport and STT/TTS, with a custom HA conversation agent integration that routes the transcribed text to Iji's brain via API. This way we get battle-tested audio hardware and processing without being locked into HA's native Assist capabilities.

### Wave 5: Situational Awareness
21. 🔧🧠 **Passive group chat absorption** — Listen to Signal/Slack groups, extract facts. Requires household privacy discussion.
22. 🔧🧠 **Anomaly detection on HA data** — Interpreted alerts with context from sensor history.
23. 🔧🧠 **Presence inference engine** — Probabilistic model from multi-source signals. `presence_query`, `presence_history`.
24. 🔌🧠 **Package & delivery tracking** — Parse emails, track carriers, announce arrivals. Evaluate per Growth Protocol.
25. 🔌🧠 **AirTag / FindMy location tracking** — Query Apple FindMy for AirTagged items (car keys, backpacks, vehicles). Wrap as `location_airtag` tool. No public Apple API — requires pyicloud or a reverse-engineered FindMy library. Use cases: "where are the car keys?", "where's Logan's backpack?", vehicle location. Feeds into presence inference engine (#23). Evaluate auth complexity (Apple 2FA) before committing.

### Wave 6: Household Coordination Engine
26. 🧠 **Multi-person scheduling negotiation** — Reasoning layer over FreeBusy with preferences and back-and-forth.
27. 🔧🧠 **Task delegation & follow-up** — `task_create`, `task_query`, `task_update` with proactive follow-up.
28. 🧠 **Conflict detection** — Proactive logistics problem identification.
29. 🔧🧠 **Meal planning & grocery coordination** — Dietary prefs + purchase history → suggestions and grocery lists.

### Wave 7: Learning & Preference Modeling
30. 🔧🧠 **Individual preference profiles** — Learned from observation, stored with confidence scores.
31. 🔧🧠 **Routine detection** — Batch analysis of stored data to identify recurring patterns.
32. 🔧🧠 **Feedback loops** — Track suggestion acceptance/rejection to calibrate behavior.
33. 🔧🧠 **Forgetting curves** — TTL tiers and confidence decay for knowledge entries.

### Wave 8: Autonomous Operations
34. 🧠 **Anticipatory actions** — Weather/calendar/email triggers → proactive alerts. Cron or event-driven.
35. 🔧🧠 **Automation authoring** — Iji writes and deploys HA automations. Approval workflow.
36. 🧠 **Vendor coordination** — Draft and follow up on contractor communications.
37. 🔧 **Document generation** — Packing lists, checklists, summaries, expense reports.

### Wave 9: Embodied & Physical
38. 🔌🧠 **Camera/image understanding** — Doorbell feed, fridge contents via Claude vision.
39. 🔧 **Room display panels** — See Hardware Prerequisites section above. Iji provides the data layer (calendar, weather, presence, knowledge); HA dashboards render per-room views on wall-mounted displays. This is a parallel workstream that can progress alongside Iji software waves.
40. 🔧🧠 **Physical world integration** — Vacuum, sprinklers, laundry coordination.

### Wave 10: Meta-Cognition & Self-Improvement
41. 🔧🧠 **Tool authoring** — Iji proposes, writes, and submits new tools for review.
42. 🧠 **Confidence calibration** — Self-awareness about knowledge staleness and uncertainty.
43. 🧠 **Escalation intelligence** — Learned autonomy boundaries.
44. 🧠 **Conversation quality self-assessment** — Post-interaction follow-up.

### Wave 10b: Security Improvements
- Audit Google Cloud API scopes — only enable what's actively used
- Rotate service account keys on a schedule
- Review service account permissions per calendar/doc (principle of least privilege)
- Move secrets out of config files into environment variables or a secrets manager
- Audit who has access to the household-agent repo and server
- Add rate limiting or abuse detection on inbound Signal messages
- Review 1Password household usage — ensure all adults are onboarded

### Wave 11: Household Knowledge Graph
45. 🔧 **Relationship graph** — Full social graph with contacts, context, interaction history. Evaluate Monica per Growth Protocol.
46. 🔧 **Asset & maintenance registry** — Appliances, warranties, service history. Evaluate Homebox per Growth Protocol.
47. 🔧🧠 **Institutional procedures** — Runbooks for recurring household operations.
48. 🔧 **Decision log** — Major decisions with context and rationale.
