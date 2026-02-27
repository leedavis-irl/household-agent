# Cursor Prompt: Email Send

Read `specs/EMAIL-SEND.md` for the full spec. Read `DEV-PROTOCOL.md` for project conventions.

## What to build

A new `email_send` tool that sends email from a household member's Gmail account via the Gmail API.

## Pattern to follow

`src/tools/email-search.js` is your template. Copy its structure exactly for: person resolution, permission checking, OAuth client acquisition, error handling. The new tool follows the same shape but calls `gmail.users.messages.send` instead of `gmail.users.messages.list`.

## Key implementation detail

Gmail API `users.messages.send` expects a `raw` field containing a base64url-encoded RFC 2822 email. Build the MIME message from the `to`, `subject`, and `body` inputs. Use Node's `Buffer.from(message).toString('base64url')` — no external MIME library needed for plain text.

Minimal RFC 2822 format:
```
To: recipient@example.com
Subject: Your subject
Content-Type: text/plain; charset=utf-8

Body text here
```

## Files to create

- `src/tools/email-send.js` — new tool (see spec for input/output schema)

## Files to modify

1. `src/utils/google-oauth.js` — change `GMAIL_SCOPE` from a single string to an array:
   ```javascript
   const GMAIL_SCOPES = [
     'https://www.googleapis.com/auth/gmail.readonly',
     'https://www.googleapis.com/auth/gmail.send',
   ];
   ```
   Update all references from `GMAIL_SCOPE` to `GMAIL_SCOPES`. The `getClient`, `getAuthUrl`, `handleCallback` functions already accept scopes arrays — just update the defaults.

2. `src/tools/index.js` — register `email_send` (import and add to tools array)

3. `config/household.json` — add `"email_send"` to Lee's permissions array

4. `config/prompts/capabilities/email.md` — replace the empty file with capability description covering both search/read and send, including the confirmation guideline (show draft before sending unless intent is clearly "just send it")

## Permission

The new permission is `email_send`. Check it the same way `email-search.js` checks `email_own` / `email_all`, but for send:
- A person with `email_send` can send from their own Gmail
- No cross-person sending in v1 (no `email_send_all`)

## Branch

Push to `feature/email-send`. Do not merge to main.

## Commit message

```
feat: email send tool — send Gmail on behalf of household members
```
