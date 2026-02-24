# Household AI Agent — Architecture Spec

## Project Overview

A multi-channel household AI agent built on the Anthropic Claude API. The agent receives messages from household members via Signal, Slack, and eventually other channels, resolves the sender's identity, uses Claude with tool-use to reason about the request and pull context as needed, then routes the response back through the original channel.

The name is **Iji**. The household is a polyamorous family in Berkeley — 5 adults and 4 children in a large 1914 Craftsman home. The agent serves as Chief of Staff for the household — managing scheduling, communication, home operations, household inventory, procurement, maintenance, meals, finances, vehicles, email/travel, institutional memory, and daily ops. The full scope of Iji's responsibilities is modeled on what a Butler and Housekeeper managed in a well-run noble household: everything that keeps a large home running so that no one person carries it all in their head.

## Iji's 14 Departments

The full Chief of Staff role, modeled on the combined responsibilities of a Victorian Butler and Housekeeper:

1. **Scheduling & Coordination** — Calendars, availability, conflicts, recurring events, quarterly logistics meetings, seasonal planning.
2. **Communication & Correspondence** — Relay messages, broadcast announcements, task reminders, daily/weekly briefings, external communication on the family's behalf, social obligations (RSVPs, thank-yous, gifts), incoming mail triage.
3. **Children** — AM routines, school schedules, activities, medical appointments, permission slips, homework tracking, wardrobe/sizes, growth tracking. Everything a mom would keep in her head.
4. **Entertaining & Hospitality** — Guest management, event planning, guest room readiness, frequent visitor profiles, kids' friends' parent contacts.
5. **Home Operations** — Lights, thermostat, locks, sensors, WiFi, who's home, room-by-room knowledge, security, access control (the modern keyring, 1Password integration), cleaning schedules (comms with Ruby), seasonal tasks.
6. **Household Inventory & Stores** — Every appliance (brand, model, purchase date, warranty, lifespan), kitchen utensils, linens, paint colors per room, tableware, textiles, consumables, wine/beverages, storage map.
7. **Procurement & Receiving** — Find replacements, source and price, get approval before purchasing, order on the family's behalf, track deliveries, proactive restocking, vendor relationships, receiving verification.
8. **Maintenance, Repairs & Grounds** — Preferred vendors, service history, scheduled maintenance, warranty tracking, issue triage, house renovation history, grounds and landscaping.
9. **Meals & Kitchen** — Lisa (private chef) coordination, grocery lists, dietary preferences per person, meal schedule, kitchen inventory, special occasions.
10. **Finances & Accounts** — Spending tracking, household splits, envelope system, bill tracking, budget monitoring, tax-relevant expenses, contractor payments, household ledger.
11. **Vehicles & Transport** — Who drives what, maintenance schedules, insurance/registration renewals, parking permits, gas/charging.
12. **Email, Travel & Documents** — Surface confirmations and receipts, communicate on the family's behalf, trip planning, loyalty programs, important documents and expiration dates, insurance policies.
13. **Institutional Memory & Standards** — House rules, routines, preferences, 1Password adoption, vendor preferences, contact directory, house standards, traditions, house history (110-year-old Craftsman quirks).
14. **Weather & Daily Ops** — Morning context, outfit guidance, commute conditions, severe weather alerts.

## Core Principles

**Identity first, context on demand.** The only information pre-loaded into every Claude call is who is speaking and their permissions. All other context (calendar, home state, household knowledge) is retrieved via tool use only when Claude determines it's needed. This is based on the CAG vs RAG research (Chan et al., 2024) and Anthropic's context engineering guidance (Sept 2025) showing that stuffing unnecessary context degrades model performance ("context rot").

**Many front doors, one brain, one memory.** People message from whatever channel they prefer. The agent responds on the same channel. All channels converge on the same brain and share the same memory/knowledge base.

**Acknowledge and work.** The agent is allowed to take time. If a request requires tool calls, the agent sends a brief acknowledgment ("Let me check on that...") immediately, then works through the tool calls before sending the real answer. Nobody expects millisecond responses.

**Tools, not pre-fetch.** Adding new capabilities means adding new tools. The brain loop never changes — it always runs Claude with tools until Claude responds with text only.

## Architecture: Four Flows

### Flow 1: Message Broker

Receives inbound messages from all channels, normalizes them into a standard envelope, resolves identity, and passes to the brain.

**Envelope format:**

```json
{
  "person": "Steve",
  "role": "adult",
  "permissions": ["ha_office", "ha_common", "calendar_own", "knowledge_read", "knowledge_write"],
  "message": "what time is the plumber coming?",
  "source_channel": "signal",
  "reply_address": "+15551234567",
  "conversation_id": "steve-signal-2025-02-17",
  "timestamp": "2025-02-17T14:32:00Z"
}
```

**Identity resolution:** A mapping table (config file or database) that maps source-specific identifiers to household members:

- Signal phone number → person (primary)
- Signal UUID → person (fallback — signal-cli may return UUID instead of phone number, especially for accounts registered without phone number sharing)
- Slack user ID → person
- (Future) Messenger ID → person

Each person has a role (adult, child, guest) and a permission set that controls what tools the agent can execute on their behalf.

**Signal group behavior (Chief of Staff):** In Signal group chats, every message is forwarded to the brain. Claude decides whether to respond or stay silent based on system-prompt guidance (e.g. respond when she can answer a question or add useful context; stay silent for casual chat). Conversation context is shared per group per day so Claude sees the flow of conversation.

### Flow 2: The Brain

The core loop. Receives an envelope, constructs a Claude API call, and iterates until Claude produces a final text response.

**Step 1:** Build initial messages array:
- System prompt: agent identity, the person's name/role/permissions, instructions for tool use
- User message: the person's message text

**Step 2:** Call Claude API with messages + tool definitions

**Step 3:** Parse response:
- If response contains only text blocks → done, send to Flow 4
- If response contains tool_use blocks → send acknowledgment to Flow 4 (first iteration only), execute tools via Flow 3, append assistant message + tool results to messages array, go to Step 2

**Step 4:** On completion, send final response to Flow 4 with the original envelope attached for routing.

**Conversation history:** The messages array for a given conversation_id should persist (in memory or a lightweight store) so that follow-up messages within a session include prior context. TTL of ~2 hours for conversation sessions.

### Flow 3: Action Router

Executes tool calls and returns results. Each tool is an independent module.

**Initial tools (Tier 1):**

`search_knowledge` — Queries the household knowledge base. Starts as a simple JSON file or SQLite table of episodic memories (who said what, when). Upgradeable to Chroma vector search later.

`store_knowledge` — Stores a new piece of household knowledge. Tagged with who reported it, when, and optional expiry (e.g., "dinner is tacos at 7" expires end of day).

`get_ha_state` — Queries Home Assistant REST API for device/entity states. "Is anyone home?", "What's the temperature?", "Are the lights on in the kitchen?"

`control_ha` — Sends commands to Home Assistant. Permission-gated: the agent must verify the person has permission for the target device/area before executing.

`check_calendar` — Queries Google Calendar API for a specific person's events. Permission-gated: people can check their own calendar, adults can check shared household calendar.

**Tier 2 tools (Month 2+):**

`search_gmail` — Search a person's Gmail for travel confirmations, receipts, etc.

`search_slack` — Search household Slack channels for context.

`search_docs` — Search shared Google Docs.

**Permission enforcement:** The action router checks the person's permissions before executing any tool. If denied, it returns a clear message to Claude ("Permission denied: Steve cannot access financial systems") so Claude can explain to the user.

### Flow 4: Response Router

Receives the final response and the original envelope, routes the reply back through the correct channel.

- If `source_channel` is "signal" → send via Signal API
- If `source_channel` is "slack" → send via Slack API
- If `source_channel` is "cli" → print to stdout (for testing)

The CLI channel is important for development — it lets you test the full brain loop without any messaging integration.

## Tech Stack

- **Runtime:** Node.js (async/event-driven fits the message broker pattern; Express for webhooks)
- **Claude API:** Anthropic Node SDK (@anthropic-ai/sdk)
- **Home Assistant:** REST API (already running at http://192.168.4.126:8123)
- **Google Calendar:** Google Calendar API via service account (config/google-service-account.json), full read/write scope. Calendar IDs per member in config/household.json. Shared client in src/utils/google-calendar.js.
- **Signal:** signal-cli native, running as JSON-RPC daemon over TCP (127.0.0.1:7583). Spawned as child process by Iji. Account: +17074748930 (Google Voice). Local dev: Homebrew at `/opt/homebrew/bin/signal-cli`. Production (EC2): `/opt/signal-cli-0.13.24/bin/signal-cli` — set `SIGNAL_CLI_PATH` in server `.env`.
- **Slack:** Slack Bolt for Node.js (@slack/bolt)
- **Knowledge store:** SQLite via better-sqlite3 to start. Schema: id, content, reported_by, reported_at, expires_at, tags
- **Conversation store:** In-memory Map with TTL, backed by SQLite for persistence across restarts
- **Google Docs:** Google Docs API via service account (same as Calendar). Used for automated doc sync — see docs/docs-sync.md. Family doc ID in household.json under `google_docs.family_doc_id`.
- **Cost tracking:** SQLite table logging every Claude API call with token counts and estimated USD cost. Weekly summary DM to Lee via Signal. Queryable via `cost_query` tool.
- **Deployment:** EC2 (ubuntu@3.149.229.204, app at `/home/ubuntu/household-agent`, systemd `iji.service`). Push to `main` triggers GitHub Actions: SSH, `git fetch`/`git reset`, `npm ci`, restart service, health check, rollback on failure, Signal notify. See docs/deploy.md. Manual scripts: `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/check-server.sh`.

## Project Structure

```
household-agent/
├── package.json
├── .env                          # API keys, HA URL, etc. (see .env.example)
├── config/
│   ├── household.json            # Identity mappings, permissions
│   ├── google-service-account.json  # Service account key (gitignored)
│   └── system-prompt.md          # Claude system prompt template
├── data/                         # Created at startup; SQLite DB + optional seed
├── docs/                         # Runbooks and ops notes (e.g. signal-ops.md, deploy.md)
├── scripts/
│   ├── deploy.sh                 # Manual deploy to EC2 (optional --push)
│   ├── rollback.sh               # Manual rollback to previous commit
│   ├── check-server.sh           # Verify EC2 is ready for deploy
│   ├── sync-docs-to-gdoc.js      # Weekly sync of .md files to shared Google Doc
│   └── weekly-cost-report.js     # Weekly cost summary DM to Lee (Signal)
├── src/
│   ├── index.js                  # Entry point: load config, ensure data/, start broker
│   ├── broker/
│   │   ├── index.js              # Message broker orchestrator
│   │   ├── signal.js             # Signal channel adapter
│   │   ├── cli.js                # CLI channel for testing
│   │   └── identity.js           # Identity resolver (uses utils/config)
│   ├── brain/
│   │   ├── index.js              # The tool-use loop
│   │   ├── prompt.js             # System prompt construction
│   │   └── conversation.js       # Conversation history manager
│   ├── tools/
│   │   ├── index.js              # Tool registry and definitions
│   │   ├── knowledge-search.js
│   │   ├── knowledge-store.js
│   │   ├── ha-query.js
│   │   ├── ha-control.js
│   │   ├── calendar.js
│   │   ├── calendar-create.js
│   │   ├── calendar-modify.js
│   │   ├── calendar-freebusy.js
│   │   ├── cost-query.js          # Query API cost data by date range, person
│   ├── router/
│   │   ├── index.js              # Response router
│   │   ├── signal.js             # Signal send adapter
│   │   └── cli.js                # CLI output
│   └── utils/
│       ├── config.js             # Load/validate household.json + required env (fail fast)
│       ├── google-calendar.js    # Shared Calendar API client (full read/write scope)
│       ├── permissions.js        # Permission checking
│       ├── db.js                 # SQLite connection + inline schema
│       └── logger.js              # Structured logging
└── (future: db/migrations/, test/, broker/slack.js, router/slack.js)
```

## Implementation Order

### Phase 1: The brain works (CLI only)

Get the core loop working with a CLI channel adapter and one or two stub tools. You should be able to type a message in your terminal, have Claude reason about it, call a tool, and get an answer back.

1. Project scaffolding (package.json, directory structure, .env)
2. CLI channel adapter (readline-based input/output)
3. Identity resolver with hardcoded household config
4. Brain loop: construct messages → call Claude → parse response → handle tool_use → loop or return
5. Stub tools: a `search_knowledge` that reads from a JSON file and a `store_knowledge` that writes to it
6. Conversation history: in-memory with TTL
7. Permission checking framework
8. End-to-end test: CLI → brain → tool → response

### Phase 2: Real tools

Wire up actual integrations, still CLI only.

1. Home Assistant state queries (REST API)
2. Home Assistant device control with permission checks
3. Google Calendar integration
4. SQLite-backed knowledge store replacing JSON stub
5. Acknowledgment pattern: detect when tools are needed, send "checking..." before executing

### Phase 3: Signal channel

Add the first real messaging channel.

1. Signal bridge setup (signal-cli-rest-api Docker container)
2. Signal inbound webhook → message broker
3. Signal outbound adapter in response router
4. Identity resolution for Signal phone numbers
5. End-to-end test: real Signal message → brain → tool → Signal reply

### Phase 4: Slack channel

Add Slack as a second channel.

1. Slack Bolt app setup
2. Slack inbound event handler → message broker
3. Slack outbound adapter in response router
4. Identity resolution for Slack user IDs
5. Cross-channel conversation continuity testing

### Phase 5: Knowledge accumulation (Tier 2)

The agent becomes the household bulletin board.

1. Knowledge expiry and cleanup
2. Knowledge tagging and search improvements
3. Proactive knowledge: agent notices relevant stored knowledge and offers it
4. Chroma vector search upgrade if simple search proves insufficient

## Configuration: household.json

```json
{
  "members": {
    "lee": {
      "display_name": "Lee",
      "role": "admin",
      "identifiers": {
        "signal": "+15551234567",
        "signal_uuid": "a62c32e9-....",
        "slack": "U07C26HRZD1"
      },
      "permissions": ["ha_all", "calendar_all", "knowledge_all", "financial", "message_send"]
    },
    "steve": {
      "display_name": "Steve",
      "role": "adult",
      "identifiers": {
        "signal": "+15559876543",
        "signal_uuid": "886f92ec-....",
        "slack": "UXXXXXXXX"
      },
      "permissions": ["ha_office", "ha_common", "calendar_own", "calendar_household", "knowledge_all", "message_send"]
    }
  },
  "permission_definitions": {
    "ha_all": "Control any Home Assistant device",
    "ha_office": "Control devices in own office only",
    "ha_common": "Control devices in common areas",
    "calendar_all": "View any household member's calendar",
    "calendar_own": "View own calendar only",
    "calendar_household": "View shared household calendar",
    "knowledge_all": "Read and write household knowledge",
    "knowledge_read": "Read household knowledge only",
    "financial": "Access financial tools and data",
    "message_send": "Send Signal messages to household members or groups (adults only)"
  }
}
```

## System Prompt Template

```
You are Iji, the household assistant. You help household members with scheduling, home control, household coordination, and information retrieval.

You are currently speaking with {person_name} ({person_role}).

Their permissions: {permissions_description}

Guidelines:
- Be conversational and warm, not robotic
- Use tools to find information rather than guessing
- If you don't have a tool for something, say so honestly
- If the person doesn't have permission for a requested action, explain what they can do instead
- When someone tells you something ("dinner is at 7", "plumber coming Wednesday"), store it as household knowledge
- When someone asks about household logistics, check the knowledge base first
- Keep responses concise — this is messaging, not email
```

## Open Decisions

**Naming:** The agent is called **Iji**.

**Signal account:** Iji uses a dedicated Google Voice number (+17074748930) registered with signal-cli. This is critical — never share a signal-cli account between two processes (e.g., Iji and OpenClaw), as Signal's ratcheting protocol will corrupt session keys irreversibly.

**Passive listening:** Iji now monitors all group chat messages and decides whether to respond, acting as Chief of Staff for the household. Claude sees every message and speaks up when it can add value — answering questions, providing context, flagging conflicts, or acknowledging information. It stays silent for casual conversation, jokes, or topics outside its scope. This replaces the earlier direct-address-only model.

**Voice:** Voice input/output (e.g., through smart speakers) is not in scope for the initial build. Can be added as another channel adapter later.

**Multi-agent:** The current design is single-agent. If complexity grows, a classifier/router that dispatches to specialized sub-agents is a future consideration.

## Relationship to Existing Projects

This project supersedes `claude-home-agent` (the AppDaemon-based Home Assistant agent on the Pi). The HA integration from that project will be absorbed as tools in this agent. The Pi may still run as the HA bridge, but the brain lives on EC2.

The Monarch-Slack integration (`~/Projects/Financial/monarch-slack-integration/`) may eventually be absorbed as a financial tool in this agent, providing transaction queries and categorization through the same conversational interface.
