# Spec: Paybacks

**Author:** Claude Opus 4.6
**Status:** v1 Complete (bug), v2 Draft
**GitHub Issue:** [Bug #100](https://github.com/leedavis-irl/household-agent/issues/100) (v1 fix), [#104](https://github.com/leedavis-irl/household-agent/issues/104) (v2 reminders + settlement)

---

## Problem

Household adults share expenses and need to track who owes whom. Currently, the payback tool exists but returns incorrect data (only shows "Hallie owes $500"). Beyond the bug, adults have no way to proactively check their balance via conversation or receive reminders about outstanding amounts.

## Context

The payback system reads from a state file (`MONARCH_PAYBACKS_STATE_FILE`) populated by a separate Monarch-Slack integration. The `finance_paybacks` tool queries this file and computes per-person net balances from a `transaction_ownership` ledger. The tool supports filtering by person and period (current, month, all-time).

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Goal

v1: Fix the bug so payback balances are accurate for all adults.
v2: Let household members ask Iji about their balance via Signal and receive periodic reminders about outstanding amounts.

---

## v1 — Current Implementation (needs bug fix)

### Tool: `finance_paybacks`

**File:** `src/tools/finance-paybacks.js`

Reads `transaction_ownership` from a JSON state file. Computes net balance per owner. Supports optional `person` filter and `period` filter (current, month, all-time).

**Parameters:**
- `person` (string, optional) — filter to one person's balance
- `period` (string, optional) — `current` (default), `month`, or `all-time`

**Returns:**
```js
{
  message: "Payback balances:\nSteve: $150.00 owed\nHallie: $500.00 owed",
  balances: { Steve: -150, Hallie: -500 }
}
```

**Known bug (#100):** Only returning Hallie's balance. Root cause TBD — likely an issue with the state file contents, the balance computation logic, or the state file path configuration.

---

## v2 — Conversational Payback Queries & Reminders

### Enhancement 1: Conversational balance queries

Adults should be able to ask Iji naturally:
- "How much do I owe?"
- "What's Steve's payback balance?"
- "Who owes money right now?"

This already works via the existing tool if the bug is fixed — no new tool needed. The capability prompt should be updated to guide Iji on how to handle these queries naturally.

### Enhancement 2: Payback reminders

Iji proactively reminds adults about outstanding payback balances via Signal.

**Behavior:**
- Weekly check (e.g. Monday morning, after morning briefing)
- If an adult owes > $0, send a friendly Signal DM: "Hey [name], you have an outstanding balance of $X on the parent account. Let me know if you have questions."
- Do not send if balance is $0 or credit
- Do not send to Lee (he's the admin/parent account holder)
- Respect a "snooze" or "stop reminding me" response (store preference in `briefing_preferences` or a new `payback_preferences` table)

### New scheduler: `src/scheduler/payback-reminders.js`

Follows the morning briefing pattern — polling interval, deduplication, Signal delivery.

```
export function startPaybackReminderScheduler()
```

- Polls every 60 seconds
- On Mondays at hour >= 10 Pacific, if not already sent this week:
  - Calls `finance_paybacks` execute with no filters
  - For each adult with negative balance, sends Signal DM
  - Deduplication key: `payback-reminder-${personId}-${isoWeekString}`

### Data Model

```sql
CREATE TABLE IF NOT EXISTS payback_preferences (
  person_id TEXT PRIMARY KEY,
  reminders_enabled INTEGER NOT NULL DEFAULT 1,  -- 1 = on, 0 = snoozed/off
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Capability Prompt

**File:** `config/prompts/capabilities/paybacks.md`

```
**Paybacks** — I track who owes whom in the household from shared expenses via the parent account.
---
- Use finance_paybacks when someone asks about payback balances, who owes money, or how much they owe.
- I also send weekly reminders to adults with outstanding balances on Mondays.
- If someone asks to stop payback reminders, update their preference.
```

**Trigger pattern** (add to `src/brain/prompt.js` → `CAPABILITY_TRIGGERS`):
```
/\b(payback|owe|owed|owes|pay back|balance.*parent|parent.*account)\b/i
```


### Enhancement 3: Balance check and payback execution

Adults should be able to:
- Ask Iji how much money is in their personal account
- Ask Iji to transfer money from their personal account to the parent account to settle their payback balance
- Approve the transfer conversationally ("yes, go ahead and pay back $150")

**Flow:**
1. Adult asks "how much do I owe?" → Iji shows payback balance (existing tool)
2. Adult asks "can you pay that back for me?" or "how much is in my personal account?"
3. Iji checks their personal account balance via `finance_accounts` (filtered by person)
4. Iji confirms: "You have $X in your personal account. Want me to transfer $Y to the parent account to settle your balance?"
5. Adult approves → Iji initiates the transfer

**New tool: `finance_transfer`**

**File:** `src/tools/finance-transfer.js` (Create)

```json
{
  "name": "finance_transfer",
  "description": "Transfer money between household accounts in Monarch Money. Requires explicit adult approval before execution.",
  "input_schema": {
    "type": "object",
    "properties": {
      "from_account": {
        "type": "string",
        "description": "Name or ID of the source account"
      },
      "to_account": {
        "type": "string",
        "description": "Name or ID of the destination account"
      },
      "amount": {
        "type": "number",
        "description": "Amount in dollars to transfer"
      },
      "note": {
        "type": "string",
        "description": "Optional note for the transfer (e.g. 'Payback for March 2026')"
      }
    },
    "required": ["from_account", "to_account", "amount"]
  }
}
```

**Behavior:**
- Validates the caller owns the source account (no transferring from someone else's account)
- Validates amount is positive and does not exceed source account balance
- Requires the caller to have explicitly approved the transfer in the current conversation (Iji must confirm before executing)
- Records the transfer in a `payback_transactions` audit table
- Updates the payback state file to reflect the settled amount
- Returns confirmation with before/after balances

**Permission:** `finance_transfer` — new permission, adults only.

**Critical safety requirement:** Iji must NEVER execute a transfer without explicit conversational approval from the account owner in the same conversation. The tool itself should check for a confirmation flag passed by the brain.

### Data Model addition

```sql
CREATE TABLE IF NOT EXISTS payback_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'completed',  -- completed, failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Open Questions

1. **Does Monarch support programmatic transfers?** The existing `monarch.js` client uses GraphQL queries for read-only operations. Transfers may require a different API endpoint or may not be supported. If Monarch doesn't support transfers, the fallback is: Iji tells the adult exactly what to do in their banking app and marks the payback as "pending settlement" in the ledger.
2. **Account mapping** — how do we know which Monarch account is each adult's "personal account"? This likely needs a mapping in `config/household.json` (e.g. `personalAccount: "Chase Checking - Steve"`).


## Files to Create

| File | Action | Description |
|------|--------|-------------|
| `src/scheduler/payback-reminders.js` | Create | Weekly payback reminder scheduler |
| `src/tools/finance-transfer.js` | Create | Account transfer tool for payback settlement |
| `config/prompts/capabilities/paybacks.md` | Create | Capability prompt for payback queries |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/finance-paybacks.js` | Modify | Fix bug #100 |
| `src/tools/index.js` | Modify | Register finance_transfer tool |
| `src/utils/db.js` | Modify | Add `payback_preferences` table |
| `src/index.js` | Modify | Import and start `paybackReminderScheduler` |
| `src/utils/permissions.js` | Modify | Add finance_transfer to TOOL_PERMISSIONS |
| `config/household.json` | Modify | Add finance_transfer permission to adults, add personal account mapping |
| `src/brain/prompt.js` | Modify | Add paybacks capability trigger |

## Server Requirements

- [ ] No new env vars (uses existing `MONARCH_PAYBACKS_STATE_FILE`)
- [ ] No new external service accounts
- [ ] No new npm packages
- [ ] SQLite table auto-created on startup (existing pattern)

## Dependencies

- Bug #100 must be fixed before v2 work begins
- State file must be correctly populated by the Monarch-Slack integration

## Do NOT Change

- The Monarch-Slack integration or state file format
- Other finance tools
- Morning briefing scheduler logic

## Commit Messages

v1: `fix: finance_paybacks returning incorrect/incomplete balances`
v2: `feat: payback reminders — weekly Signal nudge for outstanding balances`
