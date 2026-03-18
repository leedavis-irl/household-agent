# Bugfix: Signal DM replies fail with null recipient

## Symptom

Iji receives Signal DMs correctly, resolves the sender, calls the brain, executes tools — but **cannot send the reply back**. Logs show:

```
{"level":"info","msg":"Sending Signal DM","data":{"recipient":null,"length":56}}
{"level":"warn","msg":"Signal RPC error","data":{"id":1,"error":{"code":-32603,"message":"Cannot invoke \"String.startsWith(String)\" because \"identifier\" is null (NullPointerException)"}}}
```

The tool executes fine (e.g. `finance_transactions` returns data), but the response never reaches the user.

## Root Cause

In `src/broker/signal.js`, the incoming message parsing extracts:

```javascript
const senderNumber = envelope.sourceNumber || null;   // ← NULL
const senderUuid = envelope.sourceUuid || envelope.source;  // ← has value
```

signal-cli on EC2 delivers messages with UUID only — `sourceNumber` is `null`. The sender is correctly resolved via UUID through `resolve('signal_uuid', senderUuid)`, but the **phone number is never recovered**.

Then `handleDirectMessage(person, messageText, senderNumber)` is called with `senderNumber = null`, and the envelope gets `reply_address: null`. The reply fails because `sendMessage(null, text)` passes `null` to signal-cli's `send` RPC.

## Fix

### Option A (Recommended): Return identifiers from `resolve()`

In `src/broker/identity.js`, the `resolve()` function returns `{ id, display_name, role, permissions }` but **not** the member's identifiers. Add them:

```javascript
return {
  id,
  display_name: member.display_name,
  role: member.role,
  permissions: member.permissions,
  identifiers: member.identifiers,   // ← ADD THIS
};
```

Then in `src/broker/signal.js`, after resolving the person, derive the reply address from the person's config rather than the raw message field:

```javascript
const replyNumber = person.identifiers?.signal || senderNumber || senderUuid;
```

Use `replyNumber` when calling `handleDirectMessage`:

```javascript
handleDirectMessage(person, messageText, replyNumber);
```

### Also fix the group message fallback

In `handleGroupMessage`, the catch block has:

```javascript
sendMessage(senderNumber, 'Sorry, I hit an error...');
```

This has the same null problem. Use `person.identifiers?.signal || senderNumber` there too.

## Files to Modify

| File | Change |
|------|--------|
| `src/broker/identity.js` | Add `identifiers` to the return object from `resolve()` |
| `src/broker/signal.js` | After resolving person, derive `replyNumber` from `person.identifiers.signal` as fallback. Pass to `handleDirectMessage`. Fix error fallback in `handleGroupMessage`. |

## Testing

1. Restart Iji: `sudo systemctl restart iji.service`
2. Send a DM to Iji (+1XXXXXXXXXX) from Lee's phone
3. Logs should show `"recipient":"+1XXXXXXXXXX"` (Lee's number) instead of `"recipient":null`
4. Lee should receive the reply in Signal
5. Also test: send a message in a group chat with @Iji mention — reply should go to the group, not DM

## Do NOT Change

- The `sendMessage` / `sendGroupMessage` functions — they work fine, they just need non-null input
- The identity resolution logic — it correctly resolves by UUID
- The tool execution pipeline — finance_transactions etc. work correctly
- The envelope shape — other parts of the system depend on it

## Commit Message

`fix: Signal DM replies fail when sourceNumber is null — use resolved person identifiers`
