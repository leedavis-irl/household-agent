# Post-Mortem: Signal DM Null Recipient + Wave 2 Unconfigured

**Date:** 2026-02-25
**Severity:** High
**Time to fix:** ~1 hour (discovery to spec handoff)

## What Happened

Iji's Wave 2 tools (finance, weather, email) were deployed in the initial commit but never configured on EC2 — no MONARCH_*, GOOGLE_*, or WEATHER_* env vars existed on the server. Additionally, when Lee sent the first DM to test finance, Iji processed the request correctly but could not send the reply — the recipient was `null`.

## Incident Log

### Issue 1: Wave 2 env vars missing on server
- **Symptom:** Tools existed in code but would fail silently on any call requiring Monarch/Gmail credentials
- **Root Cause:** `.env` is gitignored. CI deploys code via `git reset --hard` + `npm ci` but never touches `.env`. The initial deployment set up Anthropic/HA/Signal vars but not Monarch/Gmail vars. No spec or checklist tracked this.
- **Fix:** Manually added `MONARCH_EMAIL`, `MONARCH_PASSWORD`, `MONARCH_TOTP_SECRET` to EC2 `.env`. Restarted service. Logs confirmed "Monarch login successful."

### Issue 2: Signal DM replies sent to null recipient
- **Symptom:** `{"msg":"Sending Signal DM","data":{"recipient":null}}` followed by signal-cli NullPointerException
- **Root Cause:** signal-cli on EC2 delivers messages with UUID only — `envelope.sourceNumber` is `null`. Identity resolution works via UUID, but `handleDirectMessage` passes raw `senderNumber` (null) as the reply address instead of the resolved person's phone number from `config/household.json`.
- **Fix:** Spec written (`specs/BUGFIX-signal-null-recipient.md`). Fix: return `identifiers` from `resolve()`, use `person.identifiers.signal` as reply address fallback. Handed to Cursor.

## What Our Process Should Have Caught

1. **No server requirements checklist existed** — the initial commit spec (W2S4, W2S5, W2S3) had env var documentation but no mandatory "confirm these are on EC2" step. Code was "done" when it merged.
2. **No server confirmation step** — nobody sent a test Signal message after the initial deploy. The service ran for weeks with broken tools.
3. **No verification checklist** — no document said "send a DM, check logs for non-null recipient." The null bug would have been caught in 30 seconds.

## Template Vaccination

| Template/File Updated | What Was Added |
|-----------------------|----------------|
| `DEV-PROTOCOL.md` | Added step 5 (Server Confirmation) as mandatory. Added Server Requirements Checklist section. |
| `docs/templates/spec.md` | Server Requirements checklist is now a required section in every spec |
| `docs/templates/verify.md` | Created. Includes Signal-specific tests (DM reply, group reply, null recipient check) |
| `.cursorrules` | Added "Reply Address Rule" — never use raw sourceNumber, always resolve from identity. Added "Env Rule" — env vars must be documented in spec + .env.example + manually applied to server. |

## Lessons Learned

"Code on main" is not "feature works." The gap between deploy and verification is where bugs hide — especially env var gaps and runtime-only issues that can't be caught by reading code. Every feature needs a concrete "send this message, see this response, check this log line" verification step.
