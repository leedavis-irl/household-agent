# [Capability Name]

**Sphere:** [Scheduling & Logistics | Property & Home | Finances | People & Relationships | Procurement & Errands | Meals & Kitchen | Children | Engine]
**Backlog item:** [Exact name from BACKLOG.md]
**Depends on:** [List any tools, integrations, or queue items that must exist first — or "none"]

## What to build

[2-4 sentences describing what this capability does, why it matters to the household, and what the user experience looks like. Write this for someone who will implement it without asking any questions.]

## Context

[Any relevant background — existing files to read, APIs already integrated, patterns to follow from existing tools. Point CC to specific files where helpful, e.g. "follow the pattern in src/tools/email-search.js".]

## Implementation notes

[Specific technical guidance — which files to create or modify, what the tool name should be, any edge cases to handle, error handling expectations. Be specific but not prescriptive about approach.]

## Server requirements

[Any env vars, config changes, EC2 steps, or manual setup needed — or "none"]

## Verification

[Specific test cases to run. Format: "Ask Iji: '[exact prompt]' → expected response". Include at least 2-3 test cases that confirm the feature works end to end.]

## Done when

- [ ] [Specific, checkable criterion 1]
- [ ] [Specific, checkable criterion 2]
- [ ] [Tests pass]
- [ ] [Committed and deployed to EC2]

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "[Card Title]" "In Review"
```

## Commit message

`[type]: [short description]`

Types: feat, fix, docs, chore, ops
