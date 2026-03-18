# Queue Spec: Meal planning + grocery coordination intelligence

**Sphere:** Procurement & Errands
**Project:** Iji

## Goal

Dietary preferences + purchase patterns into plan suggestions

## What to build

Build the capability described above, following existing patterns in the codebase.

### Steps

1. Read `ARCHITECTURE.md` and `DEV-PROTOCOL.md` for project context
2. Read sibling files in `src/tools/` to follow existing patterns
3. Implement the new tool(s) in `src/tools/`
4. Register in `src/tools/index.js`
5. Add permission mapping in `src/utils/permissions.js`
6. Add capability prompt in `config/prompts/capabilities/` if needed
7. Add trigger keywords in `src/brain/prompt.js` if needed
8. Update `config/household.json` with any new permissions for relevant members
9. Update `.env.example` if new env vars are needed
10. Run `npm test` to confirm all tests pass

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

`feat: meal planning grocery coordination intelligence`
