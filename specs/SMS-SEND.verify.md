# Verification: SMS Send

**Spec:** `specs/SMS-SEND.md`

## Pre-deploy (code review)

- [ ] `twilio.js` broker uses `fetch()` to Twilio REST API (no SDK dependency)
- [ ] `twilio.js` exports `sendSms(toNumber, body)` and `isConfigured()`
- [ ] `sms-send.js` follows same patterns as `message-send.js` (permission check, person resolution, error handling)
- [ ] Contact resolution order: contacts.json → household.json → raw phone number → error
- [ ] `from_person` relay support works (prefixes message with "From [Name]: ")
- [ ] Tool registered in `src/tools/index.js`
- [ ] `sms_send` permission added to Lee in `household.json`
- [ ] `sms.md` capability prompt covers when to use SMS vs Signal
- [ ] `contacts.json` created with valid structure
- [ ] `.env.example` documents all three Twilio env vars
- [ ] No Twilio credentials hardcoded anywhere

## Post-deploy (Signal tests)

**Setup:** After deploy, Lee must add Twilio env vars to `.env` on EC2 and restart.

- [ ] "Text Lisa to confirm Thursday's menu" → resolves Lisa from contacts.json, sends SMS, reports success
- [ ] Verify SMS actually arrives on Lisa's phone
- [ ] "Text +14155551234 and say hello" → sends to raw phone number
- [ ] "Text Steve about dinner" → prefers Signal (Steve is a household member), or sends SMS if explicitly asked
- [ ] "Text someone" with unknown contact → helpful error with instructions
- [ ] Ask Steve to text (no sms_send permission) → clear opt-in message

## Twilio not configured

- [ ] If env vars are missing, tool returns clear "SMS isn't set up yet" error (no crash)
- [ ] `isConfigured()` returns false → graceful degradation

## Restart resilience

- [ ] Restart Iji service → sms_send still works (no in-memory state)
- [ ] No Twilio session/connection to maintain (stateless REST calls)

## Error paths

- [ ] Send to invalid phone number → Twilio error, clear message to user
- [ ] Twilio rate limit → clear error
- [ ] Twilio balance exhausted → clear error
- [ ] Empty message → Iji should compose something reasonable or ask, not error
- [ ] contacts.json missing or malformed → graceful fallback, no crash
