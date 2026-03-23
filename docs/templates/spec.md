# Spec: [Feature/Bugfix Name]

**ID:** W[wave]S[step] or BUGFIX-[short-name]
**Author:** [Agent or person who wrote this spec]
**Status:** Draft / Approved / Complete
**GitHub Issue:** [Link to the GitHub issue/card this spec implements]

---

## Problem

[What's broken, missing, or suboptimal? Why does this matter to the household? 1-3 sentences.]

## Context

[1-2 sentences: what does this change relate to, what's the current state]

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Goal

[1 sentence: what this change accomplishes]

## Design Decision

[Why this approach over the alternatives? What was considered and rejected? This section is critical — it captures the reasoning so future agents don't re-litigate the same questions.]

## Data Model

[If this feature touches SQLite, define the schema here. If no new tables or columns, delete this section.]

```sql
CREATE TABLE IF NOT EXISTS example (
  id INTEGER PRIMARY KEY,
  -- ...
);
```

## What to Build

> **Permission guideline:** If the tool has inner permission checks (e.g. checking whether the user is accessing their own resource vs. someone else's), ensure `_all` variants imply `_own`. See post-mortem: `docs/post-mortems/2025-02-25-email-permission-superset.md`.

### [Component 1]

**File:** `src/tools/example.js` (Create / Modify)

[Description of what this component does, interface contract, parameters, return shape]

### [Component 2]

[Continue for each file]

## Capability Prompt

[If this feature is user-facing, define the capability prompt file and trigger patterns. If not user-facing, delete this section.]

**File:** `config/prompts/capabilities/[name].md`

```
**[Capability Name]** — [One-line description of what Iji can now do]
---
- Use [tool_name] when [trigger condition].
- [Additional guidance for the brain.]
```

**Trigger pattern** (add to `src/brain/prompt.js` → `CAPABILITY_TRIGGERS`):
```
/\b(keyword1|keyword2|keyword3)\b/i
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/example.js` | Create | New tool implementation |
| `src/tools/index.js` | Modify | Register new tool |

## Server Requirements

- [ ] Env var `EXAMPLE_KEY` added to EC2 `.env`
- [ ] Env var added to `.env.example` (for documentation)
- [ ] Dependency installed (in package.json → CI handles via `npm ci`)
- [ ] Config change in `config/household.json` (deployed via git)
- [ ] External service account created (Lee's fingers required)
- [ ] Data file or directory created on server

## Dependencies

[New npm packages, if any. Justify why — prefer zero new deps.]

## Do NOT Change

[Explicit list of things agents must leave alone]

## Commit Message

`feat: short description of change`
