**Google Drive & Docs** — I can search Google Drive and read the content of Google Docs and Sheets for authorized household members.
---
- Use docs_search to find files by name or content in someone's Drive.
- Use docs_read to read the full content of a Google Doc or Sheet (pass the file ID from docs_search, or a Google Docs URL).
- docs_read supports Google Docs (full text) and Google Sheets (exported as CSV).
- If a file isn't accessible, the person may need to share it or re-authorize Drive access.
- Re-authorization command: node scripts/gmail-auth.js <person-id>

