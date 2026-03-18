# Spec: Audit Bugfix Bundle

**ID:** BUGFIX-audit-bundle
**Author:** Claude (Engineer)
**Status:** Draft — awaiting Lee's approval

---

## Context

Joint Claude + Cursor audit on 2025-02-25 found 6 issues across existing tools. Two (email permission bug, weather/finance untested) are already resolved. The remaining four are bundled here as a single fix pass.

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Goal

Fix four bugs found in the audit so every deployed tool works reliably on EC2.

## What to Fix

### Fix 1: `finance_paybacks` — hardcoded Mac path

**File:** `src/tools/finance-paybacks.js` (Modify)

**Problem:** `getStateFilePath()` falls back to `$HOME/Projects/Financial/monarch-slack-integration/data/state.json` — a Mac-local path that doesn't exist on EC2.

**Fix:** Remove the hardcoded Mac fallback path entirely. If `MONARCH_PAYBACKS_STATE_FILE` is not set, the tool should return a clear error message telling the operator to set the env var. No guessing.

Replace:
```js
function getStateFilePath() {
  return (
    process.env.MONARCH_PAYBACKS_STATE_FILE ||
    (process.env.HOME && `${process.env.HOME}/Projects/Financial/monarch-slack-integration/data/state.json`) ||
    ''
  );
}
```

With:
```js
function getStateFilePath() {
  return process.env.MONARCH_PAYBACKS_STATE_FILE || '';
}
```

The "not configured" message in `execute()` already handles the empty-path case gracefully. No other changes needed.

### Fix 2: `message_send` — silent delivery failure

**File:** `src/broker/signal.js` (Modify)
**File:** `src/tools/message-send.js` (Modify)

**Problem:** `sendMessage()` and `sendGroupMessage()` in the Signal broker are fire-and-forget. If the TCP client is null or destroyed, they log an error but return nothing. The `message_send` tool calls them and immediately returns `{ sent: true }` without knowing if the message was actually queued.

**Fix:**

1. Make `sendMessage()` and `sendGroupMessage()` return a boolean: `true` if the RPC was written to the TCP socket, `false` if the client was unavailable.

In `src/broker/signal.js`, change both functions:
```js
export function sendMessage(recipient, text) {
  debugLog('OUTGOING DM to=' + recipient + ' len=' + text.length);
  log.info('Sending Signal DM', { recipient, length: text.length });
  if (!tcpClient || tcpClient.destroyed) {
    log.error('Signal send failed: TCP client unavailable', { recipient });
    return false;
  }
  sendRpc('send', { recipient: [recipient], message: text });
  return true;
}

export function sendGroupMessage(groupId, text) {
  debugLog('OUTGOING GROUP to=' + groupId + ' len=' + text.length);
  log.info('Sending Signal group message', { groupId, length: text.length });
  if (!tcpClient || tcpClient.destroyed) {
    log.error('Signal group send failed: TCP client unavailable', { groupId });
    return false;
  }
  sendRpc('send', { groupId, message: text });
  return true;
}
```

2. In `src/tools/message-send.js`, check the return value:

Where the tool currently calls `sendGroupMessage(group.group_id, formattedMessage)` and returns `{ sent: true }`, change to:
```js
const delivered = sendGroupMessage(group.group_id, formattedMessage);
if (!delivered) {
  return { error: 'Signal is temporarily unavailable. The message was not sent. Try again in a moment.' };
}
return { sent: true, to: `group "${group.group_name}"` };
```

Same pattern for the DM path where it calls `sendMessage(signalNumber, formattedMessage)`:
```js
const delivered = sendMessage(signalNumber, formattedMessage);
if (!delivered) {
  return { error: 'Signal is temporarily unavailable. The message was not sent. Try again in a moment.' };
}
return { sent: true, to: member.display_name };
```

**Note:** This does NOT guarantee delivery to the recipient's phone — it only confirms the message was handed to signal-cli. True delivery confirmation would require tracking signal-cli's send receipts, which is a larger project. This fix catches the obvious failure case (daemon down).

### Fix 3: `.env.example` incomplete

**File:** `.env.example` (Modify)

**Fix:** Add all env vars that are referenced in code but missing from the example file. Add them with comments explaining purpose and defaults:

```
# === Signal ===
SIGNAL_ACCOUNT=+1XXXXXXXXXX
SIGNAL_ENABLED=true
# Path to signal-cli binary. Mac default: /opt/homebrew/bin/signal-cli
# EC2 default: /opt/signal-cli-0.13.24/bin/signal-cli
# SIGNAL_CLI_PATH=/opt/signal-cli-0.13.24/bin/signal-cli
# Set to 'true' to write raw signal-cli JSON to /tmp/iji-signal-debug.log
# DEBUG_SIGNAL=false

# === Monarch Money ===
MONARCH_EMAIL=
MONARCH_PASSWORD=
MONARCH_TOTP_SECRET=
# Path to monarch-slack-integration state.json for payback ledger
# MONARCH_PAYBACKS_STATE_FILE=
# Override default session file location (default: data/monarch-session.json)
# MONARCH_SESSION_FILE=

# === Logging ===
# LOG_LEVEL=info

# === CLI testing ===
# Override the default CLI user identity (default: lee)
# CLI_USER=lee
```

Keep existing vars. Only add the missing ones. Commented-out vars indicate "optional, here's what it does."

### Fix 4: `ha_control` area matching + `weather_query` open access — document

**File:** `src/utils/permissions.js` (Modify)

**Problem A:** `ha_control` uses entity ID substring matching for area permissions. Entity IDs that don't contain area tokens (e.g., `switch.front_porch_light` for a user with `ha_common`) get denied. This is a known limitation.

**Problem B:** `weather_query` has no entry in `TOOL_PERMISSIONS`, making it accessible to all users including children. This is intentional but undocumented.

**Fix:** Add documentation comments to `permissions.js`. No logic changes:

```js
/**
 * Tool → permission mapping.
 *
 * DESIGN NOTES:
 * - Tools NOT listed here are accessible to all users (default allow).
 *   This is intentional for: weather_query (everyone can ask about weather).
 * - ha_control uses area-based substring matching on entity IDs.
 *   If an entity ID doesn't contain an area token (office, kitchen, etc.),
 *   non-admin users will be denied. Workaround: use ha_all, or name entities
 *   with area prefixes. Future improvement: query HA area registry.
 */
const TOOL_PERMISSIONS = {
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/finance-paybacks.js` | Modify | Remove hardcoded Mac fallback path |
| `src/broker/signal.js` | Modify | Return boolean from send functions |
| `src/tools/message-send.js` | Modify | Check send return value, report failures |
| `.env.example` | Modify | Add missing env vars with comments |
| `src/utils/permissions.js` | Modify | Add design notes comment block |

## Server Requirements

- [ ] `MONARCH_PAYBACKS_STATE_FILE` must be set on EC2 if paybacks are to work (or left unset — tool returns "not configured" message, which is acceptable for now)
- [ ] `.env.example` changes are documentation only — no server action needed
- [ ] No new dependencies

## Dependencies

None. Zero new npm packages.

## Do NOT Change

- Do not change the `sendRpc()` function itself
- Do not change the brain loop or conversation handling
- Do not change any tool definitions (input_schema)
- Do not change `handleDirectMessage` or `handleGroupMessage` — those already use the reply address correctly (null-recipient fix is deployed)
- Do not change permission logic in email tools (already fixed separately)

## Verification

After deploy, test via Signal DM to Iji:

1. "Who owes what for shared expenses?" → Should get "not configured" message (unless MONARCH_PAYBACKS_STATE_FILE is set)
2. "Tell Steve I said hello" → Should succeed (tests message_send path)
3. "What's the weather?" → Should work (confirms weather_query still accessible)
4. "Turn on the living room lights" → Should work (confirms ha_control still works)

## Commit Message

```
fix: audit bugfix bundle — paybacks path, signal delivery check, env docs, permission docs

- Remove hardcoded Mac path from finance_paybacks (use env var only)
- Return send status from Signal broker so message_send can report failures
- Add missing env vars to .env.example
- Document ha_control area matching and weather_query open access in permissions.js
```
