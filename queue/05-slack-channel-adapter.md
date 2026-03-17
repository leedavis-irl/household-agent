# Slack channel adapter

**Sphere:** Engine › Communication
**Backlog item:** Slack channel adapter
**Depends on:** none (architecture explicitly supports it)

## What to build

Iji currently runs on Signal only. The architecture is channel-agnostic — there is already a broker/router pattern that Signal uses. Build the Slack adapter so Iji can receive and respond to messages in the Avalon MGMT Slack workspace. Iji should respond to DMs and to @mentions in channels, the same way it works on Signal.

## Read first

- `ARCHITECTURE.md` — the four-flow design, especially Flow 1 (broker) and Flow 4 (response router)
- `src/broker/signal.js` — follow this pattern for the Slack broker
- `src/router/signal.js` — follow this pattern for the Slack router
- `src/index.js` — how brokers are registered at startup
- `config/household.json` — Slack user IDs need to map to household members (check if they exist)

## Done when

- [ ] Slack broker receives messages from Avalon MGMT workspace
- [ ] Identity resolution maps Slack user IDs to household members (same pattern as Signal phone numbers)
- [ ] Iji responds to DMs in Slack
- [ ] Iji responds to @mentions in Slack channels
- [ ] Permissions work correctly — same permission model as Signal
- [ ] `npm test` passes
- [ ] Feature branch opened, PR against main

## Verify

Send Iji a DM in Slack: "what's the weather today?" — should get a real response. @mention Iji in a channel with the same question — should respond in the channel thread.

## Server requirements

- [ ] `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` must be in EC2 `.env` (check if already there from OpenClaw setup — likely yes)
- [ ] Slack app must have correct bot scopes: `chat:write`, `im:history`, `app_mentions:read`, `channels:history`

## Commit message

`feat: Slack channel adapter — DMs and @mentions in Avalon MGMT workspace`
