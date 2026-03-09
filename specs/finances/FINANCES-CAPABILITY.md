# Iji Finances Capability — Spec V1

**Capability name:** Finances & Accounts  
**Lives in:** `household-agent` (`src/tools/`, `src/brain/` system prompt)  
**Primary data source:** Monarch Money (via existing `src/utils/monarch.js` client)  
**Users:** All four adults in the household (Lee, Steve, Kelly, Hallie)  
**Interface:** Conversational — natural language questions, natural language answers via Slack, Signal DMs, and Signal group chats

---

## Purpose

Iji should be able to answer financial questions about the household at the level of a knowledgeable, experienced financial advisor — accurate, grounded in real data, and appropriately direct. Not a replacement for Peter (our Goldman Sachs advisor), but a 24/7 complement: fast answers to the questions you'd normally wait a week to ask, with the household's actual numbers behind them.

The standard for "good enough": if Lee would feel comfortable acting on the answer, or using it as a starting point for a conversation with Peter, it's good enough.

The tone is confident and direct, not overly cautious. Iji should not reflexively hedge every answer or recommend consulting a professional for things it can actually answer from data.

---

## What Iji Can Already Do (Built, W2S4)

- `finance_transactions` — search transactions by date, merchant, category, account
- `finance_paybacks` — check adult payback balances (who owes whom)

These are live tools. They give Iji access to raw transaction data from Monarch. The gap is that Iji currently treats these as data lookups, not financial reasoning.

---

## What Iji Should Be Able to Answer (V1 Scope)

All of the following should be answerable from Monarch data alone, with no additional integrations required.

### Spending & Budget
- *"How are we doing on the budget this month?"*
- *"Where can we trim the budget?"*
- *"What's our burn rate?"* / *"How can we adjust the burn?"*
- *"How much did we spend on dining last month vs. the month before?"*
- *"What are our top spending categories this quarter?"*

### Accounts & Cash
- *"How much cash do we have across all accounts?"*
- *"What's in the [specific account]?"*

### Investments & Net Worth
- *"How are our investments doing? Are we actually making money net net?"*
- *"What's our current net worth?"*
- *"How are the 529s doing?"*
- *"How is [specific holding] performing?"*

### Tax & Equity (requires reasoning, not just data)
- *"How much should we withhold when we sell equity grant shares?"*
- *"We're thinking of selling X shares of [ticker]. What are the tax implications?"*

### Retirement & Scenarios (Phase 2 — requires modeling engine)
- *"Are we on track for retirement?"*
- *"Do we need to be bringing in more income?"*
- *"What happens to our retirement picture if we buy a second property?"*

---

## Phase 1: Conversational Reasoning on Monarch Data

**Goal:** Iji can answer the spending/budget/accounts/investments questions above using existing Monarch tools plus improved reasoning in the system prompt.

### What changes

**1. System prompt update**  
Add a Finances section to Iji's system prompt that establishes:
- Iji has access to real household financial data via Monarch
- Iji reasons about that data like an experienced financial advisor, not a data retrieval bot
- Iji is direct and specific — gives numbers, not generalities
- Iji flags genuine uncertainty (e.g., tax questions where the answer depends on the user's marginal rate) but does not hedge things it can actually compute
- When answering investment performance questions, Iji is clear about what the data shows vs. what it cannot show (e.g., unrealized vs. realized gains, benchmark comparisons Monarch doesn't provide)

**2. New tool: `finance_accounts`**  
Monarch provides account balances (checking, savings, investment, 529s, credit cards). A dedicated tool that returns a clean snapshot of all accounts — name, type, current balance, institution — is needed so Iji can answer "how much cash do we have" and "how are the 529s doing" without pulling raw transactions.

Parameters: optional `type` filter (depository, investment, credit, loan), optional `name` filter  
Returns: array of `{ name, institution, type, balance, lastUpdated }`

**3. New tool: `finance_budget_summary`**  
Returns current month's budget vs. actual spend by category. Derived from Monarch's budget data. Gives Iji what it needs to answer "how are we doing on the budget" and "where can we trim."

Returns: array of `{ category, budgeted, spent, remaining, percentUsed }` + totals

**4. Equity withholding reasoning (prompt, not tool)**  
For RSU/ESPP tax questions, Iji should reason through the standard calculation: federal + state income tax at the household's marginal rate (stored in system context), FICA if applicable, and any supplemental withholding considerations. This is deterministic math given a marginal rate — no external API needed. The marginal rate for the household should be stored in Iji's household context config.

---

## Phase 2: Retirement & Scenario Modeling

The Avalon Financial Bot project built a retirement modeling engine (Monte Carlo projections, scenario analysis). This work should be evaluated for absorption into Iji as a tool rather than a separate service.

**Decision deferred** until Phase 1 is complete and we have a clear picture of what modeling the household actually needs. Do not build Phase 2 until Phase 1 is in use.

---

## What Iji Will Not Do (Scope Limits)

- **Execute transactions** — Iji reads from Monarch, does not write (except via the Transaction Review process, which is a separate capability)
- **File taxes** — out of scope
- **Replace Peter** — Iji handles fast, data-grounded answers. Complex estate planning, Goldman product recommendations, and novel scenarios still go to Peter
- **Real-time market data** — Monarch reflects account balances as of last sync, not live quotes. Iji should be clear about this when answering investment questions

---

## Data Sources

| Source | Access Method | Status |
|--------|--------------|--------|
| Monarch Money (transactions) | `finance_transactions` tool | ✅ Live |
| Monarch Money (paybacks) | `finance_paybacks` tool | ✅ Live |
| Monarch Money (accounts/balances) | `finance_accounts` tool | 🔲 To build |
| Monarch Money (budgets) | `finance_budget_summary` tool | 🔲 To build |
| Household tax context (marginal rate, filing status) | `config/household.json` | 🔲 To add |

---

## Related Processes

**Transaction Review** (`specs/finances/transaction-review/TRANSACTION-REVIEW-V2.md`)  
Standalone process that handles uncategorized transaction categorization via Slack. Posts as Iji but is not conversational. Runs independently on its own cron. Iji's Finances capability and Transaction Review share the same Monarch data source but are otherwise independent.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/tools/finance-accounts.js` | Create — account balance snapshot tool |
| `src/tools/finance-budget-summary.js` | Create — budget vs. actual tool |
| `src/tools/index.js` | Modify — register new tools |
| `config/household.json` (or equivalent) | Modify — add tax context (marginal rate, filing status) |
| `src/brain/` system prompt | Modify — add Finances reasoning section |

---

## V1 Deliverables

| Item | Priority |
|------|----------|
| `finance_accounts` tool | High |
| `finance_budget_summary` tool | High |
| System prompt: Finances reasoning section | High |
| Household tax context in config | Medium |
| Equity withholding reasoning (via prompt) | Medium |

---

## Open Questions Before Implementation

1. **Monarch budget data shape** — does the existing `monarch.js` client already expose budget data, or does a new GraphQL query need to be written? Check `src/utils/monarch.js` and the Python reference implementation before building.
2. **Household marginal tax rate** — where does this live in the codebase today, if anywhere? Check `config/` before adding.
3. **529 account visibility** — confirm that 529 accounts are connected in Monarch and visible via the accounts API. If not, this is a "Lee's Fingers Required" item (connect accounts in Monarch).
