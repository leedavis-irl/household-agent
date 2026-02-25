# Spec: [Feature/Bugfix Name]

**ID:** W[wave]S[step] or BUGFIX-[short-name]
**Author:** Claude (Engineer)
**Status:** Draft / Approved / Complete

---

## Context

[1-2 sentences: what is Iji, what does this change relate to, what's the current state]

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Goal

[1 sentence: what this change accomplishes]

## What to Build

If the tool has inner permission checks (e.g. checking whether the user is accessing their own resource vs. someone else's), ensure `_all` variants imply `_own`. See post-mortem: `docs/post-mortems/2025-02-25-email-permission-superset.md`.

### [Component 1]

**File:** `src/tools/example.js` (Create / Modify)

[Description of what this component does, interface contract, parameters, return shape]

### [Component 2]

[Continue for each file]

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

[Explicit list of things Cursor must leave alone]

## Commit Message

`feat: short description of change`
