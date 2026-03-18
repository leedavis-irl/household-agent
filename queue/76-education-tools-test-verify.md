# Education tools — test & verify

**Sphere:** Children
**Backlog item:** Education Advisor integration (decomposed: test & verify)
**Depends on:** none (tools already implemented in c04c6f0)

## What to build

Add the four education tools (`education_profile`, `education_documents`, `education_goals`, `education_team`) to the existing test suites. They were implemented in commit c04c6f0 but never added to the tool registry or permissions test files, so CI doesn't know they exist.

## Context

Tools are in `src/tools/education-profile.js`, `education-documents.js`, `education-goals.js`, `education-team.js`. Supabase client is `src/utils/supabase.js`. Permission mapping is in `src/utils/permissions.js` — already has `education` permission wired up. Tests are in `test/tool-registry.test.js` and `test/permissions.test.js`.

## Implementation notes

In `test/tool-registry.test.js`:
- Add `'education_profile', 'education_documents', 'education_goals', 'education_team'` to the `expected` array (line ~64)
- Add `'education-profile', 'education-documents', 'education-goals', 'education-team'` to the `toolFiles` array (line ~87)

In `test/permissions.test.js`:
- Add a test: `education` permission allows all 4 education tools
- Add a test: users without `education` permission are denied
- Add education tools to the child permissions "cannot do" section

## Server requirements

None — test-only change.

## Verification

- `npm test` passes with all education tools in the expected list
- Permission tests confirm `education` grants access to all 4 tools
- Permission tests confirm non-education users are denied

## Done when

- [ ] All 4 education tools in `tool-registry.test.js` expected list and toolFiles list
- [ ] Permission tests cover education tools (allow + deny)
- [ ] `npm test` passes
- [ ] Committed

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Education tools — test & verify" "In Review"
```

## Commit message

`test: add education tools to tool-registry and permissions test suites`
