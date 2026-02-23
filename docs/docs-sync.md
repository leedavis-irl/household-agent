# Docs sync to Google Doc

Iji's family-facing markdown files (project root and `docs/`) are synced into a single Google Doc on a schedule. When the content changes, the household gets a Signal notification with the doc link.

## What gets synced

- **Included:** All `.md` files in the project **root** (e.g. `ARCHITECTURE.md`, `BACKLOG.md`, `GROWTH-PROTOCOL.md`) and all `.md` files in **`docs/`** (e.g. `docs/signal-ops.md`, `docs/gmail-setup-for-members.md`). New files in those two locations are picked up automatically.
- **Excluded:** Anything under `node_modules/`, `specs/`, or `config/` (we only list root and `docs/`, so those paths are never included).
- **Order:** Root `.md` files first (alphabetically), then `docs/` `.md` files (alphabetically).

The script replaces the **entire** Google Doc body with an intro paragraph, then each file's content with a separator line (e.g. `— Source: ARCHITECTURE.md —`). Markdown is pasted as-is (not rendered).

## One-time setup

1. **Google Cloud**
   - In the same project used for Calendar (and Gmail), enable the **Google Docs API**.
   - The script uses the same service account as Calendar: `config/google-service-account.json`. No extra credentials.

2. **Google Doc**
   - Create a new Google Doc (e.g. "Iji – household docs").
   - Share it with the **service account** email (from the JSON key, e.g. `...@....iam.gserviceaccount.com`) with **Editor** access.
   - Copy the document ID from the URL: `https://docs.google.com/document/d/<DOCUMENT_ID>/edit` → use `DOCUMENT_ID`.

3. **Config**
   - In `config/household.json`, add a top-level `google_docs` object (if it doesn’t exist) with the doc ID and optional Signal group:
   ```json
   "google_docs": {
     "family_doc_id": "YOUR_DOCUMENT_ID_FROM_STEP_2",
     "signal_group_id": "YOUR_SIGNAL_GROUP_ID"
   }
   ```
   - `family_doc_id` is required. The script will exit with an error if it’s missing.
   - `signal_group_id` is optional. If set, the script sends a Signal group message when the synced content changes. To get the group ID: when Iji is running and someone messages the household group, the app registers it (see Signal ops); or use signal-cli to list groups.

4. **Signal (optional)**
   - For notifications, `SIGNAL_ACCOUNT` must be set (e.g. in `.env` or the cron environment) so the script can run `signal-cli -a <account> send -g <groupId> ...`.
   - `SIGNAL_CLI_PATH` can override the path to signal-cli (default: `/opt/homebrew/bin/signal-cli`).

## Running the script

**Manual run (from project root):**

```bash
node scripts/sync-docs-to-gdoc.js
```

**Weekly cron (e.g. Sunday 18:00):**

```bash
0 18 * * 0 cd /path/to/household-agent && node scripts/sync-docs-to-gdoc.js >> /path/to/household-agent/logs/docs-sync.log 2>&1
```

You can run the weekly Iji cost report on the same schedule; see [cost-monitoring.md](cost-monitoring.md).

Use the real path to the repo and ensure the cron environment has access to:
- `config/household.json`
- `config/google-service-account.json`
- If you use Signal notifications: `SIGNAL_ACCOUNT` (and optionally `SIGNAL_CLI_PATH`)

Create `logs/` and add `logs/*.log` to `.gitignore` if you don’t want to commit log files.

## Change detection and notifications

- The script hashes the concatenated content and stores it in **`.last-docs-hash`** (project root, gitignored).
- After each run it compares the new hash to the stored one.
- **If the content changed** (or on first run): it updates the hash file and, if `google_docs.signal_group_id` is set, sends a Signal message to that group with the doc link.
- **If nothing changed:** it only logs that there was no change and does not send a notification.

## Logging

The script logs one JSON object per line:

- `Files included` — list of file paths included.
- `Doc updated` — document ID after a successful write.
- `Content changed; notification sent` or `No content change; no notification` — whether the hash changed and whether a Signal message was sent.
- Errors (missing config, API failure, Signal send failure) are logged and the script exits with code 1.

Example:

```json
{"time":"2025-02-20T22:00:00.000Z","level":"info","msg":"Files included","files":["ARCHITECTURE.md","BACKLOG.md","GROWTH-PROTOCOL.md","docs/gmail-setup-for-members.md","docs/signal-ops.md"]}
{"time":"2025-02-20T22:00:01.000Z","level":"info","msg":"Doc updated","documentId":"..."}
{"time":"2025-02-20T22:00:01.100Z","level":"info","msg":"Content changed; notification sent","previousHash":"a1b2c3d4","newHash":"e5f6g7h8"}
```
