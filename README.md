# Iji — Household AI Agent

A multi-channel household AI agent built on the [Anthropic Claude API](https://docs.anthropic.com/en/docs/). Iji acts as chief of staff for a large household — coordinating schedules, controlling smart home devices, managing finances, routing messages, and maintaining shared institutional memory. Household members interact with Iji through Signal, Slack, or a CLI, and the agent responds on the same channel.

Named after the wise war counselor from Elden Ring.

## Architecture

Iji follows a four-flow architecture:

1. **Message Broker** — Receives inbound messages from all channels, normalizes them into a standard envelope, and resolves sender identity against a household member registry.
2. **Brain** — Core reasoning loop. Builds Claude context from identity and permissions, then iterates with tool use until Claude produces a final text response. No pre-fetching — all context is retrieved on demand via tools.
3. **Action Router** — Executes tool calls with permission enforcement. Each tool is an independent module. Access is checked against the sender's permission set before execution.
4. **Response Router** — Routes the final response back through the originating channel (Signal, Slack, or CLI).

```
Signal ─┐                                   ┌─ Signal
Slack  ─┼─→ Broker → Brain ⇄ Tools → Router ┼─ Slack
CLI    ─┘                                    └─ CLI
```

### Design Principles

- **Identity first, context on demand.** Only the speaker's identity and permissions are pre-loaded. All other context (calendar, home state, knowledge) is retrieved via tool use when Claude determines it's needed.
- **Many front doors, one brain, one memory.** All channels converge on the same reasoning loop and knowledge base.
- **Tools, not pre-fetch.** New capabilities are added by registering new tools. The brain loop never changes.

## Capabilities

Iji currently has 40+ tools across these domains:

| Domain | Tools | Description |
|--------|-------|-------------|
| **Home Automation** | `ha_query`, `ha_control`, `ha_history`, `ha_scene`, `ha_notify` | Query and control Home Assistant devices, scenes, and areas |
| **Calendar** | `calendar_query`, `calendar_create`, `calendar_modify`, `calendar_freebusy` | Google Calendar integration for all household members |
| **Finance** | `finance_transactions`, `finance_accounts`, `finance_budget_summary`, `finance_paybacks` | Transaction search, account balances, budgets via Monarch Money |
| **Messaging** | `message_send`, `sms_send`, `email_search`, `email_read`, `email_send` | Signal, SMS (Twilio), and Gmail |
| **Knowledge** | `knowledge_store`, `knowledge_search` | Shared household memory — appointments, logistics, preferences |
| **Reminders** | `reminder_set`, `reminder_list`, `reminder_update`, `reminder_cancel` | Time-based reminders with follow-up cycling |
| **Tasks** | `task_create`, `task_query`, `task_update` | Household task management |
| **Education** | `education_profile`, `education_documents`, `education_goals`, `education_team` | Children's education tracking via Supabase |
| **Other** | `weather_query`, `web_search`, `cost_query`, `feature_request_*`, `briefing_preferences` | Weather, web search, usage tracking, feature intake |

### Permissions

Every household member has a role (`admin`, `adult`, `child`) and a fine-grained permission set that controls which tools they can invoke. The action router enforces permissions before execution and returns clear denial messages to Claude when access is blocked.

See `config/household.example.json` for the full permission model.

## Deployment

Iji runs on EC2 as a systemd service. A GitHub Actions workflow deploys automatically on push to `main`:

1. SSH to server, pull latest code, `npm ci`
2. Restart the `iji` service
3. Health check (retry loop against `/health`)
4. Auto-rollback on failure

Signal messages are handled by [signal-cli](https://github.com/AsamK/signal-cli) running on the same server.

## Setup

### Prerequisites

- Node.js 20+
- signal-cli (for Signal channel)
- A Home Assistant instance (for home automation tools)
- Google Cloud project with Calendar and Gmail APIs enabled
- Anthropic API key

### Configuration

1. Copy `config/household.example.json` to `config/household.json` and populate with your household members, identifiers, and permissions.
2. Copy `.env.example` to `.env` and fill in API keys and service credentials.
3. Place Google OAuth credentials in `config/google-oauth-credentials.json` and service account key in `config/google-service-account.json`.

```bash
npm install
npm start        # Production
npm test         # Run tests (vitest)
node src/index.js --cli   # CLI mode for local testing
```

### Environment Variables

See `.env.example` for the full list. Required:

- `ANTHROPIC_API_KEY` — Claude API key
- `SIGNAL_ACCOUNT` — Signal phone number for the agent
- `HA_URL`, `HA_TOKEN` — Home Assistant instance URL and long-lived access token

Optional integrations (Slack, Twilio, Monarch Money, Brave Search, Supabase) are documented in `.env.example`.

## Development

Iji follows a strict build cycle documented in `DEV-PROTOCOL.md`:

1. **Spec** — Write a feature spec in `specs/`
2. **Implement** — Build on a feature branch, run `npm test`
3. **Verify** — Review against the spec
4. **Merge** — Push to `main`, auto-deploys
5. **Server confirm** — Verify on production via real channel test

Adding a new tool:
1. Create `src/tools/your-tool.js` with an `execute(params, envelope)` function
2. Register it in `src/tools/index.js`
3. Add permission mapping in `src/utils/permissions.js`
4. Add a capability prompt in `config/prompts/capabilities/`

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`)
- **Database:** SQLite via `better-sqlite3`
- **Channels:** signal-cli, Slack Socket Mode, Twilio
- **Integrations:** Google APIs (Calendar, Gmail), Home Assistant REST API, Monarch Money, Brave Search, Supabase
- **Testing:** Vitest
- **CI/CD:** GitHub Actions → EC2 (systemd)

## Project Structure

```
src/
├── index.js                  Entry point
├── brain/                    Claude reasoning loop + conversation state
├── broker/                   Inbound channel adapters (Signal, Slack, CLI)
├── router/                   Outbound delivery (Signal, Slack, CLI)
├── scheduler/                Reminder firing + morning briefings
├── tools/                    40+ capability modules
└── utils/                    Config, permissions, DB, integrations

config/
├── household.example.json    Household member registry + permissions template
├── system-prompt.md          Base system prompt
└── prompts/capabilities/     Per-domain capability prompts

specs/                        Feature specifications
docs/                         Architecture decisions, ops runbooks, deployment
```

## License

Private project. Not licensed for redistribution.
