# Wave 2, Step 4: Finance Tools — `finance_transactions` + `finance_paybacks`

## Context

Iji is a household AI agent. Lee has an existing Monarch Money integration (`~/Projects/Financial/monarch-slack-integration/`) that posts transactions to Slack for review and categorization. Monarch Money has no official API — the existing integration uses a reverse-engineered GraphQL API with session-based auth.

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Key Decision: Port vs. Wrap

The existing Monarch integration is Python. Iji is Node.js. Two options:

**Option A — Node port:** Rewrite the key Monarch API calls in Node.js. Cleaner integration, no cross-language dependency, but duplicates work.

**Option B — Child process wrapper:** Call the existing Python client via `child_process.execFile` with JSON output. Faster to ship, but adds Python as a runtime dependency and the interface is clunky.

**Recommendation: Option A (Node port).** The Monarch GraphQL API is straightforward — it's a handful of queries with cookie-based auth. Porting the 3-4 queries we need is less work than building and maintaining a cross-language bridge. The existing Python code serves as the reference implementation.

**Before implementing:** Cursor should read the existing Python codebase at `~/Projects/Financial/monarch-slack-integration/` to understand the GraphQL queries, auth mechanism, and data shapes.

## What to Build

### 1. Monarch Money Client (`src/utils/monarch.js`)

A standalone API client for Monarch Money's unofficial GraphQL API.

**Auth (with TOTP MFA):**
- Monarch uses email/password login that returns a session or an MFA challenge
- If MFA is required (it is — TOTP is enabled), generate a 6-digit TOTP code from the secret in `MONARCH_TOTP_SECRET` env var
- Use the `otpauth` npm package to generate TOTP codes
- Submit the TOTP code to complete login and receive the session token
- The session token is passed as a cookie or Authorization header on subsequent requests
- Tokens expire periodically (days to weeks — behavior varies)
- Store credentials in `.env`: `MONARCH_EMAIL`, `MONARCH_PASSWORD`, `MONARCH_TOTP_SECRET`
- Store the session token in `data/monarch-session.json` (gitignored)
- On each API call: try with stored token → if 401, re-login (including TOTP) → retry → if still failing, alert

**TOTP code generation:**
```javascript
import { TOTP } from 'otpauth';

const totp = new TOTP({
  secret: process.env.MONARCH_TOTP_SECRET,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
});

const code = totp.generate();
```

**Core methods:**
- `login()` → authenticate with email/password + TOTP, store session token
- `getTransactions({ startDate, endDate, search, category, account })` → query recent transactions
- `getAccounts()` → list accounts with balances
- `getCategories()` → list transaction categories
- `getBudgets({ month })` → budget status by category (for future `finance_budget` tool)

**Implementation approach:**
1. Read the Python source to extract the GraphQL endpoint URL, query strings, and auth flow
2. Use Node's native `fetch` for HTTP requests
3. GraphQL queries go as POST to the Monarch endpoint with the session token in headers
4. Parse responses and return clean JavaScript objects

**Health check:**
- Per Growth Protocol: add a health check that verifies the session is still valid on startup and every 6 hours
- If session is invalid, attempt re-login automatically (including TOTP generation)
- If re-login fails (credentials changed, TOTP secret rotated, API changed), alert Lee via Signal: "Monarch Money authentication failed. I can't access financial data until this is fixed."

### 2. Finance Transactions Tool (`src/tools/finance-transactions.js`)

**Tool name:** `finance_transactions`

**Description for Claude:** "Search household financial transactions from Monarch Money. Can filter by date range, merchant name, category, or account. Returns transaction details including amount, merchant, category, date, and account."

**Parameters:**
```json
{
  "query": "string — optional search term (merchant name, description)",
  "start_date": "string — ISO date, default: 30 days ago",
  "end_date": "string — ISO date, default: today",
  "category": "string — optional category filter",
  "account": "string — optional account name filter",
  "limit": "number — max transactions to return (default: 20, max: 50)"
}
```

**Implementation:**
- Permission check: requires `financial` permission
- Call `monarch.getTransactions()` with filters
- Return array of: `{ date, merchant, amount, category, account, pending: boolean }`
- Sort by date descending (most recent first)
- Format amounts as dollars with sign (negative = expense, positive = income)

**Error handling:**
- Auth failure → "Financial data is temporarily unavailable. Lee has been notified."
- No results → "No transactions found matching that search."

### 3. Finance Paybacks Tool (`src/tools/finance-paybacks.js`)

**Tool name:** `finance_paybacks`

**Description for Claude:** "Check the household payback ledger — who owes whom for shared expenses. Shows the current balance between adult household members."

**Parameters:**
```json
{
  "person": "string — optional, filter to see one person's balance",
  "period": "string — optional, 'current' (default) or 'month' or 'all-time'"
}
```

**Implementation notes:**
- This depends on how the existing Monarch-Slack integration tracks paybacks
- Cursor: read the existing Python codebase to understand the payback logic — it may use Monarch's split transaction feature, a separate ledger, or Slack message tracking
- If the payback logic is complex, start with a simpler version: just surface transactions tagged with a "payback" or "shared" category and calculate net balances
- Permission check: requires `financial` permission

### 4. Permission Updates

`financial` permission already exists in household.json. Verify it's assigned to the right members.

### 5. Register Tools

Update `src/tools/index.js` to import and register both tools.

## Environment Variables

Add to `.env`:
```
MONARCH_EMAIL=your-email@example.com
MONARCH_PASSWORD=your-password
MONARCH_TOTP_SECRET=your-base32-totp-secret
```

Add to `.env.example` (no real values):
```
# Monarch Money (unofficial API — reverse-engineered, TOTP MFA)
MONARCH_EMAIL=
MONARCH_PASSWORD=
MONARCH_TOTP_SECRET=
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/utils/monarch.js` | **Create** — Monarch Money GraphQL client with TOTP MFA |
| `src/tools/finance-transactions.js` | **Create** — finance_transactions tool |
| `src/tools/finance-paybacks.js` | **Create** — finance_paybacks tool |
| `src/tools/index.js` | **Modify** — register new tools |
| `.env` | **Modify** — add Monarch credentials + TOTP secret |
| `.env.example` | **Modify** — add Monarch credential placeholders |
| `data/monarch-session.json` | **Created at runtime** — add to .gitignore |
| `.gitignore` | **Modify** — add monarch-session.json |

## Dependencies

```
npm install otpauth
```

Use Node's native `fetch` for HTTP (available in Node 18+). The only new npm package is `otpauth` for TOTP code generation.

## Testing Plan

1. Run Iji: `npm start`
2. CLI: "What did we spend at Costco this month?" → should search and return transactions
3. CLI: "Show me transactions over $100 from last week" → date + amount filtering
4. CLI: "Who owes who right now?" → payback balances
5. CLI (as non-financial user): "What did we spend at Costco?" → should get permission denied
6. Kill the Monarch session manually → verify re-login (with TOTP) works
7. Use wrong credentials → verify alert is sent to Lee

## Reference Material

Cursor MUST read the existing Python implementation before writing the Node port:
- `~/Projects/Financial/monarch-slack-integration/` — the full codebase
- Look specifically at: the GraphQL query strings, the auth/login flow, the session token handling, and the transaction data shape

## Lee's Fingers Required

1. Add Monarch email, password, and TOTP secret to `.env`
2. That's it — no OAuth flow, no browser clicks
