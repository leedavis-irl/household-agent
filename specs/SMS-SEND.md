# Spec: SMS Send (Twilio)

**Decision:** `docs/decisions/2026-02-26-outbound-comms-rollout.md`
**Backlog bucket:** Communication
**Pattern reference:** `src/broker/signal.js` (broker pattern), `src/tools/message-send.js` (send tool pattern)

## Problem

Iji can only communicate via Signal. When a household member says "text Lisa to confirm Thursday's menu," Iji can't reach anyone who isn't on Signal. Key contacts outside Signal: Lisa (chef), contractors, schools, some extended family.

## Scope

Outbound SMS from a shared Twilio number. Any permitted household adult can ask Iji to send a text. The recipient sees a message from Iji's number, not the sender's personal number.

**Not in v1:** Inbound SMS (requires webhook exposure — Iji is currently Tailscale-only), MMS/media, group texts, conversation threading, auto-reply. All straightforward later.

## Architecture

### Twilio Broker

New file: `src/broker/twilio.js`

Thin wrapper around the Twilio REST API. Does not use the Twilio Node SDK — just `fetch()` to the Messages API endpoint. This keeps dependencies minimal and matches the project's preference for lightweight integrations.

```
POST https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json
Authorization: Basic base64(ACCOUNT_SID:AUTH_TOKEN)
Content-Type: application/x-www-form-urlencoded

To=+1234567890&From=+1TWILIO_NUMBER&Body=Hello
```

**Exports:**
- `sendSms(toNumber, body)` → `{ success: true, sid: '...' }` or `{ success: false, error: '...' }`
- `isConfigured()` → boolean (checks env vars are present)

### Environment Variables

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
```

Added to `.env.example` with comments. Stored in `.env` on EC2 (not in git).

### External Contacts Registry

New file: `config/contacts.json`

```json
{
  "contacts": {
    "lisa": {
      "display_name": "Lisa",
      "phone": "+14155551234",
      "context": "Chef — weekly meal prep"
    }
  }
}
```

This is for people outside the household. Household members' phone numbers are already in `household.json` identifiers. The tool checks both sources.

Contacts are added manually by editing the file (Lee or via a future tool). Keeping it simple — no self-service contact management in v1.

## Tool: sms_send

New file: `src/tools/sms-send.js`

**Input:**
```json
{
  "to": "lisa",
  "message": "Hi Lisa, confirming the menu for Thursday — going with the Thai option."
}
```

- `to` — a contact name from `config/contacts.json`, a household member id, or a raw phone number (E.164 format: `+1XXXXXXXXXX`)
- `message` — the text to send (plain text, SMS character limits apply)

**Resolution order for `to`:**
1. Check `config/contacts.json` by id (case-insensitive)
2. Check `household.json` members by id or display_name — use `identifiers.signal` as their phone number (Signal numbers are mobile numbers)
3. If it looks like a phone number (starts with `+`), use it directly
4. Otherwise, error with helpful message

**Returns:**
```json
{
  "sent": true,
  "to": "+14155551234",
  "to_name": "Lisa",
  "message_preview": "Hi Lisa, confirming the menu for..."
}
```

**Implementation notes:**
- Follow the same permission check pattern from `message-send.js`
- No confirmation step needed for SMS (unlike email) — texts are conversational, more like Signal messages
- Include `from_person` support like `message_send` for relaying: "From Lee: confirming Thursday menu"
- Truncate preview in return value (don't echo the whole message back)

## Permission

New permission: `sms_send`

Add to Lee's permissions in `household.json`. Add definition to `permission_definitions`. Other adults get it via rollout.

## Capability Prompt

New file: `config/prompts/capabilities/sms.md`

**What you can do:**
- Send text messages (SMS) to anyone with a phone number
- Look up contacts by name from the contacts registry
- Relay messages on behalf of household members

**Guidelines:**
- Use SMS for people who aren't on Signal. If the recipient is a household member on Signal, prefer Signal (message_send) unless the person specifically asks to text.
- Keep texts concise — SMS has character limits and people expect brevity.
- When relaying, prefix with who it's from: "From Lee: ..."
- If a contact isn't in the registry, ask for their phone number. Don't guess.

## Trigger Update

Add SMS trigger to `CAPABILITY_TRIGGERS`:
```javascript
sms: /\b(text|sms|txt)\b/i,
```

This will match "text Lisa" or "send an SMS to..." 

## Error Cases

- **Twilio not configured:** "SMS isn't set up yet. Lee needs to add Twilio credentials."
- **Invalid phone number:** "That doesn't look like a valid phone number. Use format: +1XXXXXXXXXX"
- **Contact not found:** "I don't have a contact named [X]. You can give me their phone number directly, or ask Lee to add them to the contacts list."
- **Twilio API error (rate limit, balance, etc.):** Pass through Twilio's error message with context.
- **Missing permission:** "You haven't opted in to SMS sending yet. Let Lee know if you'd like to enable it."

## Files to Create

- `src/broker/twilio.js` — Twilio REST API wrapper
- `src/tools/sms-send.js` — tool implementation
- `config/contacts.json` — external contacts registry (seed with empty contacts object)
- `config/prompts/capabilities/sms.md` — capability prompt

## Files to Modify

- `src/tools/index.js` — register sms_send tool
- `config/household.json` — add `sms_send` permission to Lee, add `sms_send` to permission_definitions
- `.env.example` — add Twilio env vars with comments

## Server Requirements

- [ ] Lee creates Twilio account + buys a number (Lee's fingers)
- [ ] Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to `.env` on EC2
- [ ] `sms_send` permission added to Lee in `household.json` (deploys via git)
- [ ] Seed `config/contacts.json` with at least one real contact for testing

## Commit Message

```
feat: SMS send via Twilio — text non-Signal contacts

- New twilio broker (REST API, no SDK dependency)
- New sms_send tool with contact registry lookup
- External contacts config (config/contacts.json)
- SMS capability prompt with guidelines
- Decision: docs/decisions/2026-02-26-outbound-comms-rollout.md
```

## Verification

See `specs/SMS-SEND.verify.md`
