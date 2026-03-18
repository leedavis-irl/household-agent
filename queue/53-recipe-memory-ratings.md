# Recipe memory + ratings

**Sphere:** Meals & Kitchen
**Backlog item:** Recipe memory + ratings
**Depends on:** TBD — review existing tools and integrations before starting

## What to build

Seed from Firen's spreadsheet

## Context

Read `ARCHITECTURE.md` and `DEV-PROTOCOL.md` for project context. Check existing tools in `src/tools/` for patterns to follow. Check `BACKLOG.md` for additional notes on this capability.

## Implementation notes

Follow existing tool patterns in `src/tools/`. Each tool needs:
1. A tool file with `definition` and `execute` exports
2. Registration in `src/tools/index.js`
3. Permission mapping in `src/utils/permissions.js`
4. Capability prompt entry if user-facing
5. Trigger keywords in `src/brain/prompt.js` if applicable

## Server requirements

- [ ] Any new env vars added to EC2 `.env`
- [ ] Any new env vars documented in `.env.example`
- [ ] Config changes in `config/household.json` if needed
- [ ] DB migration if new tables are needed

## Verification

- Test via CLI: `node src/index.js` and exercise the new capability
- Test via Signal: send Iji a message that triggers the new capability
- Verify permission enforcement: test with a user who lacks the permission

## Done when

- [ ] Capability described in Goal is functional end-to-end
- [ ] `npm test` passes with no new failures
- [ ] Code follows existing patterns
- [ ] No hardcoded secrets or paths
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Recipe memory + ratings" "In Review"
```

## Commit message

`feat: recipe memory ratings`
