# Finances Phase 1 — Verification Checklist

## Local Verification

### Tool loading
- [ ] `npm test` passes (all non-db-schema tests)
- [ ] 29 tools load (confirm via test output or `getToolDefinitions().length`)

### finance_accounts
- [ ] Returns grouped accounts with balances when called with no filters
- [ ] `type` filter (e.g., `"investment"`) returns only matching accounts
- [ ] `name` filter (e.g., `"529"`) returns only matching accounts
- [ ] Returns `totalNetWorth` sum across all accounts
- [ ] Returns `{ error: "..." }` when user lacks `financial` permission

### finance_budget_summary
- [ ] Returns budget vs. actual for current month when called with no args
- [ ] `month`/`year` params return data for the specified period
- [ ] Categories sorted by `percentUsed` descending (over-budget first)
- [ ] Includes income and expense totals
- [ ] Returns `{ error: "..." }` when user lacks `financial` permission

### Permissions
- [ ] `permissions.js` maps both new tools to `['financial']`
- [ ] Only Lee has `financial` permission in `household.json`
- [ ] Non-financial users get permission denied for both tools

### Prompt / capability loading
- [ ] Finance capability prompt loads when message matches trigger regex
- [ ] Trigger regex matches: money, spend, budget, account, balance, net worth, 529, invest, RSU, ESPP, tax, etc.
- [ ] Prompt includes tax context (MFJ, 32% federal, 9.3% CA)
- [ ] Prompt includes all 5 finance tool descriptions

## Regression Checks
- [ ] Existing finance tools (`finance_transactions`, `finance_paybacks`, `cost_query`) still work
- [ ] No other capability prompts affected
- [ ] No changes to broker, router, or other non-finance code paths

## Server Confirmation (after deploy)
- [ ] `journalctl -u iji.service --no-pager -n 30` — no startup errors
- [ ] Monarch auth succeeds (session token cached)
- [ ] Send Signal DM: "What are our account balances?" → returns real Monarch data
- [ ] Send Signal DM: "How's the budget this month?" → returns real budget data
- [ ] Send Signal DM: "What's our net worth?" → returns account totals
- [ ] Verify non-admin user gets permission denied for finance questions
