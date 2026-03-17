# Iji Project Memory

## Queue Processing Progress (2026-03-16)
- **queue/01**: Already completed by Lee (commit 9f8aab6)
- **queue/02**: Done — finance tools verified, added to health check + tests, BACKLOG updated. Committed on main.
- **queue/03**: Done — secret sync runbook already existed at docs/ops/secrets.md. BACKLOG updated. Committed on main.
- **queue/04**: Done — briefing opt-in/out built. Committed on `feature/briefing-opt-in-out` branch (commit 29164b4). Queue file deleted from disk.
- **queue/05**: IN PROGRESS — Slack adapter. `@slack/bolt` installed, `src/broker/slack.js` created. Still needs: router, wiring into broker/router index, .env.example, tests, BACKLOG, commit. On `feature/slack-channel-adapter` branch.
- **queue/06-08**: Not started yet.

## Architecture Notes
- 4-flow architecture: broker → brain → action router → response router
- Channel adapters: broker (inbound) + router (outbound)
- Identity resolution in `src/broker/identity.js` — resolve(channel, identifier)
- Tool registration in `src/tools/index.js`
- Permissions in `src/utils/permissions.js`
- Capability prompts in `config/prompts/capabilities/`
- DB migrations in `src/utils/db.js` — versioned migration array
- Queue files are untracked (not committed to git) — just delete from disk when done

## Key Patterns
- Feature work goes on `feature/*` branches per DEV-PROTOCOL.md
- Documentation-only changes can go straight to main
- Tests via `npm test` (vitest)
- Household config at `config/household.json`
