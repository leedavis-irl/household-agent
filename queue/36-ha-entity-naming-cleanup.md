# Queue Spec: HA entity naming cleanup

**Sphere:** Property & Home
**Project:** Iji

## Goal

Multiple entity_id / friendly_name mismatches in HA and Hue

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

`feat: ha entity naming cleanup`
