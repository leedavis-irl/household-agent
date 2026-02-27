# Feature Request Intake — Cursor Instructions

Read `ARCHITECTURE.md` and `specs/FEATURE-REQUESTS.md` before starting. Follow existing patterns exactly.

## Branch

```bash
git checkout main && git pull
git checkout -b feature/feature-requests
```

## 1. Database Migration

In `src/utils/db.js`, add to the `migrate()` function (after the `conversation_evals` table):

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

Add index:
```sql
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status)
```

## 2. Create `src/tools/feature-request.js`

Pattern: follow `src/tools/knowledge-store.js`

```js
import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feature_request',
  description: 'Log a feature request or suggestion from a household member. Use when someone says "I wish you could...", "feature request:", "it would be nice if...", "can you add...", or similar.',
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'What the person wants Iji to be able to do',
      },
    },
    required: ['request'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  const result = db
    .prepare(
      'INSERT INTO feature_requests (requester_id, request_text) VALUES (?, ?)'
    )
    .run(envelope.person, input.request);

  return { submitted: true, id: result.lastInsertRowid };
}
```

## 3. Create `src/tools/feature-request-list.js`

Pattern: follow `src/tools/reminder-list.js` for query structure

```js
import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feature_request_list',
  description: 'List feature requests. Admin only. Defaults to showing new/unreviewed requests.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: new, accepted, declined, merged, built. Default: new',
      },
    },
  },
};

export async function execute(input, envelope) {
  if (envelope.role !== 'admin') {
    return { error: 'Only admins can view feature requests.' };
  }

  const db = getDb();
  const status = input?.status || 'new';

  const rows = db
    .prepare(
      'SELECT id, requester_id, request_text, status, triage_notes, created_at, triaged_at FROM feature_requests WHERE status = ? ORDER BY created_at DESC'
    )
    .all(status);

  return { requests: rows, count: rows.length };
}
```

## 4. Create `src/tools/feature-request-triage.js`

Pattern: follow `src/tools/reminder-update.js` for update structure

```js
import { getDb } from '../utils/db.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'feature_request_triage',
  description: 'Triage a feature request — accept, decline, merge, or mark as built. Admin only. Optionally notify the requester via Signal DM.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: 'Feature request ID',
      },
      status: {
        type: 'string',
        description: 'New status: accepted, declined, merged, built',
      },
      triage_notes: {
        type: 'string',
        description: 'Reasoning for the decision',
      },
      notify_requester: {
        type: 'boolean',
        description: 'Send a Signal DM to the requester about the decision. Default: false',
      },
    },
    required: ['id', 'status'],
  },
};

const VALID_STATUSES = ['new', 'accepted', 'declined', 'merged', 'built'];

export async function execute(input, envelope) {
  if (envelope.role !== 'admin') {
    return { error: 'Only admins can triage feature requests.' };
  }

  if (!VALID_STATUSES.includes(input.status)) {
    return { error: `Invalid status: ${input.status}. Must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  const db = getDb();

  const existing = db
    .prepare('SELECT * FROM feature_requests WHERE id = ?')
    .get(input.id);

  if (!existing) {
    return { error: `Feature request ${input.id} not found.` };
  }

  db.prepare(
    'UPDATE feature_requests SET status = ?, triage_notes = ?, triaged_at = datetime(\'now\') WHERE id = ?'
  ).run(input.status, input.triage_notes || null, input.id);

  const result = { updated: true, id: input.id, status: input.status };

  // Notification is handled by Claude — when notify_requester is true,
  // Claude should compose a natural message and use message_send to DM the requester.
  // We return the requester_id and request_text so Claude has what it needs.
  if (input.notify_requester) {
    result.notify = {
      requester_id: existing.requester_id,
      request_text: existing.request_text,
      new_status: input.status,
    };
  }

  return result;
}
```

**Important:** The notification DM is NOT sent by this tool directly. The tool returns `notify` data, and Claude uses it to compose a natural message and call `message_send`. This keeps the tool simple and lets Claude write the message in Iji's voice.

## 5. Register tools in `src/tools/index.js`

Add imports at the top with the other imports:
```js
import * as featureRequest from './feature-request.js';
import * as featureRequestList from './feature-request-list.js';
import * as featureRequestTriage from './feature-request-triage.js';
```

Add to the `tools` object:
```js
  feature_request: featureRequest,
  feature_request_list: featureRequestList,
  feature_request_triage: featureRequestTriage,
```

Do NOT add these tools to `TOOL_PERMISSIONS` in `src/utils/permissions.js`. The submit tool is default-allow (everyone). The list and triage tools enforce admin role internally.

## 6. Create capability prompt

Create `config/prompts/capabilities/feature-requests.md`:

```
**Feature Requests** — Household members can suggest new capabilities or improvements.
---
- When someone says "I wish you could...", "feature request:", "it would be nice if...", "can you add...", or similar, use feature_request to log it.
- Respond warmly after logging. Don't promise timelines or speculate on feasibility.
- Don't prompt people to submit feature requests. Only capture them when volunteered.
- Lee can use feature_request_list and feature_request_triage to review and act on requests.
- When triaging with notify_requester: true, compose a natural Signal DM using message_send to tell the requester what happened. Sound like Iji, not a ticket system.
```

## 7. Morning briefing integration

In `src/utils/morning-briefing.js`, add a section for pending feature requests. Only include for admin users.

Query: `SELECT COUNT(*) as count FROM feature_requests WHERE status = 'new'`

If count > 0, add a line like: `📋 ${count} new feature request${count > 1 ? 's' : ''} to review`

Place it after reminders and before any closing section. Import `getDb` from `../utils/db.js`. Check the person's role from household config — only include for `role: 'admin'`.

## 8. Prompt loader

Check `src/brain/prompt.js` — if capability prompts are auto-discovered from the `config/prompts/capabilities/` directory, no change needed. If they're manually listed, add `feature-requests` to the list.

## Commit

```bash
git add -A
git commit -m "feat: feature request intake — submit, list, triage tools"
git push -u origin feature/feature-requests
```

Open PR against main.
