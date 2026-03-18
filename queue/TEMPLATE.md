# [Capability Name]

**Sphere:** [Scheduling & Logistics | Property & Home | Finances | People & Relationships | Procurement & Errands | Meals & Kitchen | Children | Engine]
**Backlog item:** [Exact name from BACKLOG.md]
**Depends on:** [List any tools, integrations, or queue items that must exist first — or "none"]

## What to build

[REQUIRED: 2-4 sentences minimum. Describe what this capability does, why it matters to the household, and what the user experience looks like. Write this for an AI engineer who will implement it without asking any questions. "Needs X tools" is NOT a valid description — explain what the tool does, who uses it, and what happens when they do.]

## Context

[REQUIRED: Point to specific existing files, tools, or patterns to follow. Examples:
- "Follow the pattern in `src/tools/email-search.js`"
- "Uses the Supabase client from `src/utils/supabase.js`"
- "The existing `calendar_query` tool handles similar date logic"
Do NOT just say "Read ARCHITECTURE.md" — that's assumed. Add what's specific to this card.]

## Implementation notes

[REQUIRED: 20+ words of specific technical guidance. Must include at least ONE of:
- File paths to create or modify (e.g., `src/tools/my-tool.js`)
- Tool name and parameter schema
- API endpoints or data sources
- Database tables or schema
- Integration patterns

Generic boilerplate like "Follow existing tool patterns in src/tools/" is NOT sufficient.]

## Server requirements

[Any env vars, config changes, EC2 steps, or manual setup needed — or "none"]

## Verification

[REQUIRED: At least 2 concrete test scenarios. Format:
- "Ask Iji: '[exact prompt]' → [expected behavior]"
- Or for non-conversational: "Run `npm test` → [expected result]"
Do NOT leave as placeholder text.]

## Done when

[REQUIRED: 3+ specific, checkable criteria. Each must be independently verifiable.
BAD:  "Capability described in Goal is functional end-to-end"
GOOD: "`src/tools/vendor-query.js` exists with `definition` and `execute` exports"
GOOD: "Permission `education` gates all 4 tools in `src/utils/permissions.js`"
GOOD: "`npm test` passes with no new failures"

Always include:
- [ ] [At least one criterion about what files/code exist]
- [ ] [At least one criterion about behavior or integration]
- [ ] Tests pass (`npm test`)
- [ ] Committed with message from this spec]

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "[Card Title]" "In Review"
```

## Commit message

`[type]: [short description matching the work done]`

Types: feat, fix, docs, chore, ops, test
