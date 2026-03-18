# Queue Spec: Slack adapter: app DMs and events not working

**Sphere:** Iji Engine
**Project:** Iji

## Goal

Socket Mode connects but Slack blocks DMs ('messages to this app turned off'). App Home messages tab enabled, reinstall attempted. Likely needs event subscription config or OAuth scope fix.

## What to build

Investigate and fix the issue described above. Read the relevant source files before making changes.

### Steps

1. Identify the root cause by reading the relevant code and logs
2. Implement the fix with minimal blast radius
3. Verify the fix doesn't break existing functionality
4. Run `npm test` to confirm all tests pass

## Server Requirements

- [ ] Any new env vars added to EC2 `.env`
- [ ] Any new env vars documented in `.env.example`
- [ ] Dependencies installed (handled by CI `npm ci` if in package.json)
- [ ] Config changes in `config/household.json` (deployed via git)

## Done when

- The capability described in the Goal is functional end-to-end
- `npm test` passes with no new failures
- Code follows existing patterns (tool definition + execute function)
- No hardcoded secrets or paths

## Commit message

`feat: slack adapter app dms and events not working`
