# Phase 3: Signal Channel Adapter

## Context

Iji is a household AI agent. Phases 1-2 are done: CLI adapter, brain loop with tool-use, identity resolution, SQLite knowledge store, Home Assistant integration, Google Calendar stubs.

Now add Signal as the first real messaging channel so household members can text the agent.

## Signal Infrastructure

**signal-cli** is already installed (`/opt/homebrew/bin/signal-cli`, version 0.13.24) and registered with the Google Voice number `+17074748930`. Account data is at `~/.local/share/signal-cli/data/`. No other process is using it (OpenClaw has been killed and disabled).

## What to Build

### 1. Signal Broker (`src/broker/signal.js`)

Use signal-cli's **daemon mode** via child_process:

```
signal-cli -a +17074748930 daemon --json
```

This spawns signal-cli as a long-running subprocess that:
- Reads JSON-RPC requests on **stdin** (for sending)
- Writes JSON events on **stdout** (incoming messages)

**Receiving messages:**
- Parse each line from stdout as JSON
- Look for envelope objects with `dataMessage` containing `message` text
- Extract the sender's phone number from the envelope `source` or `sourceNumber` field
- Ignore non-message events (receipts, typing indicators, etc.)
- Resolve identity via the existing `resolve('signal', phoneNumber)` function
- If identity resolves: build envelope, call `think()`, send reply
- If identity doesn't resolve: optionally send a "Sorry, I don't know who you are" reply, or just ignore. Log it either way.

**Sending replies:**
- Write JSON-RPC `send` calls to signal-cli's stdin
- The JSON-RPC format for sending is:
```json
{"jsonrpc":"2.0","method":"send","params":{"recipient":["+1XXXXXXXXXX"],"message":"reply text"},"id":1}
```
- Each send needs a unique incrementing `id`

**Error handling:**
- If signal-cli process exits, log error and attempt restart after 5 seconds
- If signal-cli binary is not found, log warning and skip (don't crash the app)
- Graceful shutdown: kill the signal-cli child process on SIGINT/SIGTERM

### 2. Signal Router (`src/router/signal.js`)

Export a `send(text, replyAddress)` function that sends a message via signal-cli.

The signal broker module should expose a way for the router to send messages. The simplest approach: the broker module holds a reference to the signal-cli process and exports a `sendMessage(recipient, text)` function. The router calls it.

### 3. Update Broker (`src/broker/index.js`)

- Import and start Signal alongside CLI
- Signal should start in the background (don't block CLI)
- Add env var `SIGNAL_ACCOUNT` (default: `+17074748930`) and `SIGNAL_ENABLED` (default: `true`)
- If `SIGNAL_ENABLED=false` or signal-cli is not found, skip gracefully

### 4. Update Router (`src/router/index.js`)

- Import signal router
- Route replies for `source_channel: 'signal'` through signal router
- The signal router needs the recipient phone number from `envelope.reply_address`

### 5. Update `config/household.json`

Update Lee's signal identifier to the real phone number:
```json
"lee": {
  "identifiers": {
    "signal": "+13392360070",
    ...
  }
}
```

Leave Steve's and River's signal identifiers as-is for now (they'll be updated when we know their numbers).

### 6. Update `.env`

Add:
```
SIGNAL_ACCOUNT=+17074748930
SIGNAL_ENABLED=true
```

## Architecture Constraints

- The `think()` function and brain loop do NOT change. The Signal adapter feeds envelopes into the same brain as CLI.
- The `reply_address` for Signal envelopes is the sender's phone number (so the router knows where to send the reply).
- `conversation_id` format: `{person_id}-signal-{YYYY-MM-DD}`
- The acknowledgment pattern should work: `onAcknowledge` callback sends the ack text back via Signal before the brain finishes thinking.

## Testing Plan

After building, I should be able to:
1. `npm start` — both CLI and Signal adapters start
2. Send a text to +17074748930 from +13392360070
3. Iji resolves identity as Lee, processes the message, replies via Signal
4. CLI still works simultaneously

## Dependencies

No new npm dependencies should be needed — Node.js `child_process` is built-in. signal-cli handles the Signal protocol.

## Important

- Read ARCHITECTURE.md for full context on the four-flow design
- Look at the existing cli.js broker and cli.js router as patterns to follow
- The signal adapter is conceptually identical to CLI but with signal-cli as the transport instead of readline
- Keep the code simple and readable — no unnecessary abstractions
