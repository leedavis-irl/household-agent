# Cursor Prompt: SMS Send (Twilio)

Read `specs/SMS-SEND.md` for the full spec. Read `DEV-PROTOCOL.md` for project conventions.

## What to build

An `sms_send` tool that sends text messages via Twilio's REST API, with a contact registry for external people.

## Pattern to follow

- **Broker:** `src/broker/signal.js` shows the broker pattern, but the Twilio broker is much simpler — stateless HTTP calls, no TCP connection, no process management. Just a thin `fetch()` wrapper.
- **Tool:** `src/tools/message-send.js` is your template for the tool. Copy its structure for person resolution, permission checking, `from_person` relay support, and error handling.

## Twilio broker implementation

`src/broker/twilio.js` — no Twilio SDK. Use `fetch()` directly:

```javascript
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

export function isConfigured() {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
}

export async function sendSms(toNumber, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  
  const params = new URLSearchParams({
    To: toNumber,
    From: TWILIO_FROM,
    Body: body,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.message || `Twilio error ${res.status}` };
  }
  return { success: true, sid: data.sid };
}
```

## Contact resolution

The tool resolves `to` in this order:
1. `config/contacts.json` — external contacts by id (case-insensitive)
2. `config/household.json` — members by id or display_name, using `identifiers.signal` as phone number
3. Raw phone number — if `to` starts with `+`, use directly
4. Error — not found

Load `contacts.json` with a helper similar to `getHousehold()`. Handle missing file gracefully (return empty contacts).

## Files to create

- `src/broker/twilio.js` — Twilio REST wrapper
- `src/tools/sms-send.js` — tool implementation
- `config/contacts.json` — seed with: `{ "contacts": {} }`
- `config/prompts/capabilities/sms.md` — capability prompt (see spec for content)

## Files to modify

1. `src/tools/index.js` — register `sms_send`
2. `config/household.json`:
   - Add `"sms_send"` to Lee's permissions
   - Add `"sms_send": "Send SMS text messages to external contacts via Twilio"` to `permission_definitions`
3. `.env.example` — add:
   ```
   # Twilio SMS (optional — needed for sms_send tool)
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_FROM_NUMBER=
   ```

## Permission

`sms_send` — check it the same way `message-send.js` checks permissions. Simple: if the person has `sms_send` in their permissions, they can send.

## Branch

Push to `feature/sms-send`. Do not merge to main.

## Commit message

```
feat: SMS send via Twilio — text non-Signal contacts
```
