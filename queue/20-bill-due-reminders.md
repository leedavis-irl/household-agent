# Bill due reminders

**Sphere:** Finances
**Backlog item:** Bill due reminders
**Depends on:** finance_transactions, reminder_set tools

## What to build

Proactively remind household members about upcoming bills based on transaction history patterns. Iji detects recurring charges from Monarch data and creates reminders before due dates.

## Context

Finance tools already query Monarch Money for transactions (src/tools/finance-transactions.js). Reminder infrastructure exists (src/tools/reminder-set.js, src/scheduler/reminders.js). The key work is a recurring job that analyzes transaction patterns and creates bill reminders.

## Implementation notes

Create `src/utils/bill-detector.js` that runs weekly, queries recent transactions for recurring patterns (same merchant, similar amount, monthly cadence), and creates reminders for upcoming bills. Also create `src/tools/bill-reminders.js` that lets Lee manually add/remove bill tracking. Store tracked bills in a new `bills` SQLite table.

## Server requirements

- [ ] DB migration for `bills` table runs automatically

## Verification

- Ask Iji: "What bills are coming up?" → Lists detected recurring bills and next due dates
- Ask Iji: "Track the PG&E bill, usually around $200 on the 15th" → Adds to tracked bills
- Verify reminder is created ahead of detected bill due date

## Done when

- [ ] Bill detection from Monarch transaction patterns
- [ ] `bill_reminders` tool for manual bill tracking
- [ ] Automatic reminder creation for upcoming bills
- [ ] `bills` table via migration
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Bill due reminders" "In Review"
```

## Commit message

`feat: add bill due reminders from transaction pattern detection`
