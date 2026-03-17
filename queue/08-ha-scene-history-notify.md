# HA tool expansion — scene, history, notify

**Sphere:** Property & Home
**Backlog items:** Scene/automation triggers, Historical state analysis, HA notification dispatch
**Depends on:** ha_query and ha_control (✅ Verified)

## What to build

Three small Home Assistant tools that follow the exact same pattern as the existing `ha_query` and `ha_control` tools. Each wraps a different HA REST API endpoint.

- `ha_scene` — activate a scene by name (calls `scene.turn_on`)
- `ha_history` — get the state history of an entity over a time range (calls `/api/history/period`)
- `ha_notify` — send a notification via HA notification service (calls `notify.*`)

## Read first

- `src/tools/ha-query.js` — follow this pattern exactly
- `src/tools/ha-control.js` — follow this pattern exactly
- `src/tools/index.js` — how to register tools
- `src/utils/permissions.js` — how to add tool permissions
- `ARCHITECTURE.md`
- Home Assistant REST API docs are at `http://100.127.233.50:8123/api/` — query it if needed to understand endpoint shapes

## Done when

- [ ] `ha_scene` tool: accepts scene name or entity_id, activates it via HA, returns confirmation
- [ ] `ha_history` tool: accepts entity_id and optional hours (default 24), returns state history as a readable summary
- [ ] `ha_notify` tool: accepts message and optional title + target notifier, sends via HA notify service
- [ ] All three registered in `src/tools/index.js`
- [ ] Permissions added in `src/utils/permissions.js` (follow same area-based gating as ha_control)
- [ ] `npm test` passes
- [ ] Feature branch opened, PR against main

## Verify

Via CLI:
- "Activate the movie night scene" → HA scene activates
- "What has the front door sensor been doing for the last 6 hours?" → history returned
- "Send a notification saying dinner is ready" → HA notification fires

## Server requirements

- [ ] None — HA_URL and HA_TOKEN already in `.env`, EC2 reaches HA via Tailscale

## Commit message

`feat(home): add ha_scene, ha_history, ha_notify tools`
