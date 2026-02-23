# Wave 2, Step 3: Gmail Integration — `email_search` + `email_read`

## Context

Iji is a household AI agent. The brain loop, tool framework, identity resolution, and permission system are all working. Signal and CLI channels are live. Google Calendar works via service account.

Gmail requires a different auth pattern — per-user OAuth2 — because Google does not allow service accounts to access consumer Gmail. This is the first per-user OAuth integration in Iji and will establish the pattern for Google Drive later.

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## What to Build

### 1. Google OAuth2 Infrastructure (`src/utils/google-oauth.js`)

A shared OAuth2 utility that manages per-user tokens. This will be reused for Google Drive and any future Google API that requires user-scoped auth.

**Setup:**
- Create an OAuth2 client using credentials from `config/google-oauth-credentials.json` (the OAuth client ID/secret downloaded from Google Cloud Console — NOT the existing service account key)
- Scopes for Gmail: `https://www.googleapis.com/auth/gmail.readonly` (read-only to start; write access comes in Wave 4)
- Store refresh tokens per household member in `data/oauth-tokens.json` (gitignored)

**Token management:**
- `getClient(personId)` → returns an authenticated OAuth2 client for that person, auto-refreshing the access token from the stored refresh token
- `getAuthUrl(personId)` → returns the consent URL for a person to authorize Iji (used during initial setup)
- `handleCallback(personId, authCode)` → exchanges the auth code for tokens and stores them
- If no token exists for a person, tools should return a clear message: "I don't have access to {person}'s Gmail yet. They need to authorize me first."

**One-time setup flow (requires Lee's fingers):**
1. Go to Google Cloud Console → APIs & Credentials
2. Create an OAuth 2.0 Client ID (Desktop app type)
3. Download the credentials JSON → `config/google-oauth-credentials.json`
4. Enable Gmail API in the project (Calendar API should already be enabled)
5. Run a setup script: `node scripts/gmail-auth.js lee` → prints a URL → Lee opens it → clicks Allow → pastes the auth code back → script stores the refresh token
6. Repeat for each household member who wants email access

**Setup script** (`scripts/gmail-auth.js`):
```
Usage: node scripts/gmail-auth.js <person-id>

1. Reads OAuth credentials from config/google-oauth-credentials.json
2. Generates auth URL with gmail.readonly scope
3. Prints URL to terminal
4. Waits for user to paste auth code
5. Exchanges code for tokens
6. Stores refresh token in data/oauth-tokens.json under person-id key
7. Verifies by making a test API call (get profile)
```

### 2. Email Search Tool (`src/tools/email-search.js`)

**Tool name:** `email_search`

**Description for Claude:** "Search a person's Gmail for messages matching a query. Use Gmail search syntax: from:, to:, subject:, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, label:, is:unread. Returns message snippets — use email_read for full content."

**Parameters:**
```json
{
  "person": "string — who's email to search (default: the person speaking)",
  "query": "string — Gmail search query (same syntax as Gmail search box)",
  "max_results": "number — max messages to return (default: 10, max: 25)"
}
```

**Implementation:**
- Permission check: `email_own` (search own email) or `email_all` (search anyone's)
- Get authenticated client via `google-oauth.getClient(personId)`
- Call `gmail.users.messages.list({ userId: 'me', q: query, maxResults })`
- For each message ID returned, call `gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] })`
- Return array of: `{ id, threadId, from, to, subject, date, snippet }`
- If no OAuth token for the person: return "I don't have access to {person}'s Gmail. They need to run the authorization setup."

**Error handling:**
- Token expired / revoked → clear stored token, return "Gmail authorization has expired for {person}. They need to re-authorize."
- Rate limit → return "Gmail is rate-limiting me. Try again in a minute."
- No results → return "No emails found matching that search."

### 3. Email Read Tool (`src/tools/email-read.js`)

**Tool name:** `email_read`

**Description for Claude:** "Read the full content of a specific email or thread. Use email_search first to find the message ID."

**Parameters:**
```json
{
  "person": "string — whose email to read",
  "message_id": "string — the message ID from email_search results",
  "thread": "boolean — if true, read the full thread (default: false)"
}
```

**Implementation:**
- Permission check: same as email_search
- If `thread: false`: `gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })`
- If `thread: true`: use `gmail.users.threads.get({ userId: 'me', id: threadId })`
- Parse the message payload:
  - Walk the MIME parts tree to find `text/plain` (preferred) or `text/html` (strip tags as fallback)
  - Extract headers: From, To, Cc, Subject, Date
  - Note attachments (filename + size) but don't download them
- Return: `{ id, threadId, from, to, cc, subject, date, body, attachments: [{ filename, size }] }`
- For threads: return array of messages in chronological order

**Body extraction notes:**
- Gmail messages use a nested MIME multipart structure
- The `payload.parts` array may contain `multipart/alternative` which itself contains `text/plain` and `text/html`
- Always prefer `text/plain`. If only HTML exists, strip tags (use a simple regex or a lightweight lib like `striptags`)
- Body content is base64url encoded — decode with `Buffer.from(data, 'base64url').toString('utf-8')`
- If body is very long (>4000 chars), truncate and note "Message truncated. Full message is {n} characters."

### 4. Permission Updates

Add to `config/household.json` permission definitions:
```json
{
  "email_own": "Search and read own Gmail",
  "email_all": "Search and read any household member's Gmail"
}
```

Add `email_own` to adult members. Add `email_all` to Lee (admin).

### 5. Register Tools

Update `src/tools/index.js` to import and register both tools with the tool registry.

## Dependencies

```
npm install googleapis
```

The `googleapis` package includes the Gmail client. If it's already installed for Calendar, no new dependency is needed — check `package.json` first.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/utils/google-oauth.js` | **Create** — shared OAuth2 client with per-user token management |
| `scripts/gmail-auth.js` | **Create** — one-time setup script for authorizing a user |
| `src/tools/email-search.js` | **Create** — email_search tool |
| `src/tools/email-read.js` | **Create** — email_read tool |
| `src/tools/index.js` | **Modify** — register new tools |
| `config/household.json` | **Modify** — add email permissions |
| `data/oauth-tokens.json` | **Created at runtime** — add to .gitignore |
| `.gitignore` | **Modify** — add oauth-tokens.json and google-oauth-credentials.json |

## Testing Plan

After building, test via CLI:

1. Run `node scripts/gmail-auth.js lee` → complete OAuth flow
2. Start Iji: `npm start`
3. CLI: "Search my email for messages from the school" → should return results
4. CLI: "Read the first one" → should return full message body
5. CLI: "Search Steve's email for Costco receipts" → should work if Lee has email_all
6. Test with no token: temporarily rename oauth-tokens.json → should get clear error message
7. Test with expired token: should get re-authorization message

## Security Notes

- `oauth-tokens.json` contains refresh tokens that grant ongoing access to Gmail. MUST be gitignored.
- `google-oauth-credentials.json` contains the OAuth client secret. MUST be gitignored.
- Gmail scope is read-only. Write access (send/draft) comes in Wave 4 with a separate permission grant.
- The OAuth consent screen will show as "unverified app" since we won't submit for Google verification. This is fine for personal/household use — just click through the warning during setup.

## Lee's Fingers Required

1. Create OAuth Client ID in Google Cloud Console and download credentials JSON
2. Enable Gmail API in the same Google Cloud project used for Calendar
3. Run `node scripts/gmail-auth.js lee` and click through the OAuth consent flow in browser
4. Repeat for other household members who want email access
