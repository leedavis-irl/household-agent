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

**Identity resolution:** A mapping table (config file or database) that maps source-specific identifiers to household members:

- Signal phone number → person (primary)
- Signal UUID → person (fallback — signal-cli may return UUID instead of phone number, especially for accounts registered without phone number sharing)
- Slack user ID → person
- (Future) Messenger ID → person

Each person has a role (adult, child, guest) and a permission set that controls what tools the agent can execute on their behalf.

**Signal group behavior (Chief of Staff):** In Signal group chats, every message is forwarded to the brain. Claude decides whether to respond or stay silent based on system-prompt guidance (e.g. respond when she can answer a question or add useful context; stay silent for casual chat). Conversation context is shared per group per day so Claude sees the flow of conversation.

### Flow 2: The Brain

The core loop. Receives an envelope, builds Claude context from identity/permissions, and iterates with tool use until Claude produces final text. Tool calls are executed by the router, results are appended to conversation state, and Claude continues reasoning until no more tools are needed.

**Conversation history:** The messages array for a given conversation_id should persist (in memory or a lightweight store) so that follow-up messages within a session include prior context. TTL of ~2 hours for conversation sessions.

### Flow 3: Action Router

Executes tool calls and returns results. Each tool is an independent module with its own input contract and error handling. The router enforces access controls before execution and returns permission-denied results to Claude when needed.

**Permission enforcement:** The action router checks the person's permissions before executing any tool. If denied, it returns a clear message to Claude ("Permission denied: Steve cannot access financial systems") so Claude can explain to the user.

### Flow 4: Response Router

Receives the final response and the original envelope, routes the reply back through the correct channel.

- If `source_channel` is "signal" → send via Signal API
- If `source_channel` is "slack" → send via Slack API
- If `source_channel` is "cli" → print to stdout (for testing)

The CLI channel is important for development — it lets you test the full brain loop without any messaging integration.

## Open Decisions

**Naming:** The agent is called **Iji**.

**Signal account:** Iji uses a dedicated Google Voice number (+17074748930) registered with signal-cli. This is critical — never share a signal-cli account between two processes (e.g., Iji and OpenClaw), as Signal's ratcheting protocol will corrupt session keys irreversibly.

**Passive listening:** Iji now monitors all group chat messages and decides whether to respond, acting as Chief of Staff for the household. Claude sees every message and speaks up when it can add value — answering questions, providing context, flagging conflicts, or acknowledging information. It stays silent for casual conversation, jokes, or topics outside its scope. This replaces the earlier direct-address-only model.

**Voice:** Voice input/output (e.g., through smart speakers) is not in scope for the initial build. Can be added as another channel adapter later.

**Multi-agent:** The current design is single-agent. If complexity grows, a classifier/router that dispatches to specialized sub-agents is a future consideration.

## Relationship to Existing Projects

This project supersedes `claude-home-agent` (the AppDaemon-based Home Assistant agent on the Pi). The HA integration from that project will be absorbed as tools in this agent. The Pi may still run as the HA bridge, but the brain lives on EC2.

The Monarch-Slack integration (`~/Projects/Financial/monarch-slack-integration/`) may eventually be absorbed as a financial tool in this agent, providing transaction queries and categorization through the same conversational interface.

## Landmines

**signal-cli runtime paths:** Local development expects Homebrew at `/opt/homebrew/bin/signal-cli`. Production EC2 uses `/opt/signal-cli-0.13.24/bin/signal-cli`; set `SIGNAL_CLI_PATH` in server `.env`.

**Dedicated Signal account:** Iji uses a dedicated Google Voice number (+17074748930) registered with signal-cli. Never share one signal-cli account between two processes (e.g., Iji and OpenClaw); Signal's ratcheting protocol can irreversibly corrupt session keys.
