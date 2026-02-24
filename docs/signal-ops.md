# Signal Operations Runbook

## Account Details

- **Iji Signal number:** +17074748930 (Google Voice)
- **signal-cli binary (local/Mac):** /opt/homebrew/bin/signal-cli
- **signal-cli binary (production EC2):** /opt/signal-cli-0.13.24/bin/signal-cli — set `SIGNAL_CLI_PATH=/opt/signal-cli-0.13.24/bin/signal-cli` in the server’s `.env` so Iji can spawn it.
- **signal-cli data (local):** ~/.local/share/signal-cli/data/
- **Debug log:** /tmp/iji-signal-debug.log

## How It Works

Iji spawns signal-cli as a JSON-RPC daemon on startup. It communicates over TCP on 127.0.0.1:7583. All incoming messages arrive as JSON-RPC `receive` events. Outgoing messages are sent via `send` RPC calls.

In group chats, Iji acts as Chief of Staff: every group message is sent to Claude, who decides whether to respond or stay silent (e.g. respond when she can answer a question or add useful context; stay silent for casual chat or when someone else already answered). In DMs, Iji responds to everything.

## Common Operations

### Check if Iji is receiving messages

```bash
tail -f /tmp/iji-signal-debug.log
```

Look for lines with `dataMessage` — those are actual messages. Lines with `typingMessage` or `receiptMessage` are typing indicators and read receipts.

### Restart Iji

```bash
cd ~/Projects/Home/household-agent && node src/index.js
```

Iji will kill any existing signal-cli daemon and start a fresh one.

### Send a test message from the CLI

Stop Iji first (only one process can use the account at a time), then:

```bash
signal-cli -a +17074748930 send -m "test message" -g "GROUP_ID_HERE"
```

### Update Iji's Signal profile name

```bash
# Stop Iji first
signal-cli -a +17074748930 updateProfile --given-name "Iji"
```

### Add a new household member

1. Have them send a message in the group so their UUID appears in the debug log
2. Find their UUID: `grep "sourceName.*TheirName" /tmp/iji-signal-debug.log | tail -1`
3. Add them to `config/household.json` with both `signal` (phone) and `signal_uuid` fields
4. Restart Iji

### Re-register the Signal account (nuclear option)

If session corruption occurs (persistent `InvalidMessageException` decryption errors), you may need to re-register. This happened when OpenClaw and Iji shared the same account.

1. Get a new Google Voice number (or reuse existing)
2. Go to https://signalcaptchas.org/registration/generate.html
3. Open DevTools > Network tab, solve the captcha
4. Find the request to `/challenge` in Network tab, copy the full `signalcaptcha://...` token
5. Immediately run: `signal-cli -a +1XXXXXXXXXX register --captcha 'TOKEN'`
6. Check Google Voice for verification code
7. Run: `signal-cli -a +1XXXXXXXXXX verify CODE`
8. Update the account number in `src/broker/signal.js` (SIGNAL_ACCOUNT constant)
9. Join the group: `signal-cli -a +1XXXXXXXXXX joinGroup --uri "https://signal.group/..."`
10. Set profile: `signal-cli -a +1XXXXXXXXXX updateProfile --given-name "Iji"`

**Critical:** The captcha token expires in ~30 seconds. Have the register command ready before solving.

## Troubleshooting

### Messages received but Iji doesn't respond

Check the debug log. Common causes:
- **No `dataMessage`:** Receipt or typing indicator, not an actual message. Normal.
- **`sourceNumber: null`:** The sender's UUID isn't in household.json. Add their `signal_uuid`.
- **Staying silent:** In group chats, Iji may choose not to reply (Chief of Staff behavior). If she should have replied, check the system prompt and cost/logs; she is instructed to stay silent when in doubt.

### `InvalidMessageException: decryption failed`

Session keys are corrupted. This is usually caused by two processes sharing the same signal-cli account. The only reliable fix is re-registering with a new number (see above).

### `Config file is in use by another instance`

Another signal-cli process is running. Kill it:
```bash
pkill -f "signal-cli.*+17074748930"
```

### Iji responds in DMs instead of group

Check that group detection is working. The code checks `dataMessage.groupInfo`, `dataMessage.group`, and `dataMessage.groupV2` for the group ID.

## Key Lesson Learned

**Never share a signal-cli account between two processes.** Signal's Double Ratchet protocol maintains per-session encryption keys. If two processes use the same account, they'll desync the ratchet state, causing permanent `InvalidMessageException` errors that cannot be fixed by trust commands or database wipes. The only fix is a fresh registration.
