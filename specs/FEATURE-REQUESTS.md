# Feature Request Intake

## What and Why

Household members (Steve, Kelly, Hallie, Lee) can submit feature requests to Iji via natural conversation. Requests go into an intake queue — not directly to the backlog. Lee and Engineer triage them: dedup against existing work, decide priority, accept/decline/merge, then optionally notify the requester.

This gives the household a voice in Iji's roadmap without creating noise in the backlog or obligating Lee to build everything requested.

## Database

New table in `src/utils/db.js` migrate function:

```sql
CREATE TABLE IF NOT EXISTS feature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT NOT NULL,
  request_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  triage_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  triaged_at TEXT
)
```

Status values: `new`, `accepted`, `declined`, `merged`, `built`

Index: `CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status)`

## Tools

### 1. `feature_request` — Submit a request

**Who can use:** All adults (no special permission — default allow)

**Input:**
```json
{
  "request": "string — what they want Iji to do"
}
```

**Behavior:**
- Inserts into `feature_requests` with `requester_id` from envelope, `status: 'new'`
- Returns `{ submitted: true, id: <rowid> }`

**Claude behavior:** After submitting, Iji responds warmly: "Got it, I've logged that. Lee reviews these and I'll let you know what happens." Don't promise timelines. Don't editorialize on feasibility.

### 2. `feature_request_list` — View requests

**Who can use:** `admin` role only (check `envelope.role === 'admin'` inside execute)

**Input:**
```json
{
  "status": "string, optional — filter by status. Default: 'new'"
}
```

**Behavior:**
- Queries `feature_requests` filtered by status, ordered by `created_at DESC`
- Returns array of `{ id, requester_id, request_text, status, triage_notes, created_at, triaged_at }`

### 3. `feature_request_triage` — Update a request

**Who can use:** `admin` role only (check `envelope.role === 'admin'` inside execute)

**Input:**
```json
{
  "id": "integer — request ID",
  "status": "string — new/accepted/declined/merged/built",
  "triage_notes": "string, optional — reasoning for the decision",
  "notify_requester": "boolean, optional — send a Signal DM to the requester. Default: false"
}
```

**Behavior:**
- Updates the row: set `status`, `triage_notes`, `triaged_at = datetime('now')`
- If `notify_requester` is true and status changed, use `message_send` internally to DM the requester:
  - `accepted`: "Hey {name}! Your idea about {summary} is going on the roadmap."
  - `declined`: "Hey {name}, I looked into {summary} — it's not something we'll tackle right now, but I appreciate the suggestion."
  - `merged`: "Hey {name}, your idea about {summary} is actually related to something already in the works!"
  - `built`: "Hey {name}, that thing you asked about — {summary} — is live now!"
- Returns `{ updated: true, id, status }`

**Notification messages:** Claude composes these naturally based on the request text and triage notes. The messages above are patterns, not templates. Iji should sound like Iji, not a ticket system.

## Permission Model

Use **role-based** check for list and triage, not a new permission string. Check `envelope.role === 'admin'` inside the tool execute function. This avoids adding permissions to every adult's config for a tool they can't use anyway.

The `feature_request` submit tool has **no permission requirement** (not listed in TOOL_PERMISSIONS = default allow). All household members can submit.

## Capability Prompt

New file: `config/prompts/capabilities/feature-requests.md`

```
**Feature Requests** — Household members can suggest new capabilities or improvements.
---
- When someone says "I wish you could...", "feature request:", "it would be nice if...", "can you add...", or similar, use feature_request to log it.
- Respond warmly after logging. Don't promise timelines or speculate on feasibility.
- Don't prompt people to submit feature requests. Only capture them when volunteered.
- Lee can use feature_request_list and feature_request_triage to review and act on requests.
```

## Morning Briefing Integration

If there are `new` feature requests, include a line in Lee's morning briefing:

> "📋 3 new feature requests to review"

Only show for admin users. Implementation: modify `src/utils/morning-briefing.js` to query `SELECT COUNT(*) as count FROM feature_requests WHERE status = 'new'` and include the line if count > 0.

## Files to Create
- `src/tools/feature-request.js` — submit tool
- `src/tools/feature-request-list.js` — list tool (admin)
- `src/tools/feature-request-triage.js` — triage tool (admin)
- `config/prompts/capabilities/feature-requests.md` — capability prompt

## Files to Modify
- `src/utils/db.js` — add migration for `feature_requests` table
- `src/tools/index.js` — register three new tools
- `src/utils/morning-briefing.js` — add pending request count for admin users
- `src/brain/prompt.js` — register new capability prompt file (if not auto-discovered)

## Commit Message
```
feat: feature request intake — submit, list, triage tools
```
