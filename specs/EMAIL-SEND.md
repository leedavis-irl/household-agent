# Spec: Email Send (Gmail)

**Decision:** `docs/decisions/2026-02-26-outbound-comms-rollout.md`
**Backlog bucket:** Email & Documents
**Pattern reference:** `src/tools/email-search.js` (same OAuth flow, permission model, error handling)

## Problem

Iji can search and read email but can't send on anyone's behalf. Lee wants to say "email Lisa to confirm Thursday's menu" and have Iji do it.

## Scope

Send email from a household member's Gmail account via the Gmail API. Lee only for v1 (only person with OAuth token). Includes a confirmation step — Iji drafts the email and shows it before sending, unless the person explicitly says to just send it.

**Not in v1:** email_draft tool (save as Gmail draft without sending), attachments, HTML formatting, CC/BCC. These are straightforward additions later.

## OAuth Scope Change

The current scope in `src/utils/google-oauth.js` is:

```javascript
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
```

This needs to become an array supporting both read and send:

```javascript
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];
```

All existing code that references `GMAIL_SCOPE` needs to use the updated scopes. The `getClient`, `getAuthUrl`, and `handleCallback` functions already accept a `scopes` parameter — the default just needs to change.

**After deploy, Lee must re-authorize:**
```bash
node scripts/gmail-auth.js lee
```

This is a manual step (Lee's fingers). The auth flow will request the expanded scope. Existing read capabilities continue to work — the new token is a superset.

## Tool: email_send

New file: `src/tools/email-send.js`

**Input:**
```json
{
  "to": "lisa@example.com",
  "subject": "Thursday menu confirmation",
  "body": "Hi Lisa, just confirming the menu for Thursday...",
  "person": "lee"
}
```

- `person` — whose Gmail to send from (defaults to the person speaking, same as email_search)
- `to` — recipient email address (required)
- `subject` — email subject (required)
- `body` — plain text body (required)

**Returns:**
```json
{
  "sent": true,
  "to": "lisa@example.com",
  "subject": "Thursday menu confirmation",
  "messageId": "..."
}
```

**Implementation notes:**
- Uses the Gmail API `users.messages.send` endpoint
- Message must be constructed as a base64url-encoded RFC 2822 email (MIME format)
- Set `From` header to the authenticated user's email (the API handles this automatically when using `me` as userId)
- Follow the same permission check, person resolution, and error handling patterns from `email-search.js`

## Permission

New permission: `email_send`

- `email_send` — can send email from own Gmail account

Add to `config/household.json` for Lee. Add to `permission_definitions`. Other adults get it when they opt in.

This is deliberately separate from `email_own` (read) — someone might want Iji to read their email but not send on their behalf.

## Capability Prompt

Update `config/prompts/capabilities/email.md` (currently nearly empty). Add send capability description and guidelines:

**What you can do section:**
- Search and read email for permitted users
- Send email on behalf of permitted users

**Guidelines section:**
- When asked to send email, compose the message and show it to the person before sending. Say: "Here's what I'd send — should I go ahead?" Only send after confirmation.
- Exception: if the person says something like "just send it" or "email Lisa and tell her X" with enough specificity that the intent is clear, send without a preview.
- Always include who the email is from, to, and subject in your confirmation.
- Keep emails professional and concise unless the person specifies a tone.
- If the person doesn't have `email_send` permission, explain they need to opt in.

## Trigger Update

The existing email trigger in `CAPABILITY_TRIGGERS` already covers this:
```javascript
email: /\b(email|inbox|gmail|message from|mail)\b/i,
```

This will match "email Lisa" or "send an email" — no change needed.

## Error Cases

- **No OAuth token:** Same message as email_search — "They need to authorize me first."
- **Token expired/revoked:** Same refresh + re-auth flow as email_search.
- **Invalid recipient address:** Gmail API will reject — return a clear error.
- **Send quota exceeded:** Gmail API rate limit — tell the user to try again later.
- **Missing permission:** "You haven't opted in to email sending yet. Let Lee know if you'd like to enable it."

## Files to Create

- `src/tools/email-send.js` — tool implementation

## Files to Modify

- `src/utils/google-oauth.js` — update default scope to include `gmail.send`
- `src/tools/index.js` — register email_send tool
- `config/prompts/capabilities/email.md` — add send capability description + guidelines
- `config/household.json` — add `email_send` permission to Lee
- `.env.example` — no changes (OAuth setup already documented)

## Server Requirements

- [ ] No new env vars
- [ ] After deploy: Lee must re-authorize Gmail with expanded scope (`node scripts/gmail-auth.js lee` on EC2)
- [ ] `email_send` permission added to Lee in `household.json` (deploys via git)

## Commit Message

```
feat: email send tool — send Gmail on behalf of household members

- New email_send tool using Gmail API users.messages.send
- OAuth scope expanded to include gmail.send
- New email_send permission (separate from read)
- Updated email capability prompt with send guidelines
- Decision: docs/decisions/2026-02-26-outbound-comms-rollout.md
```

## Verification

See `specs/EMAIL-SEND.verify.md`
