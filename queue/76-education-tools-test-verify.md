# Education tools — test & verify

**Sphere:** Children
**Backlog item:** Education Advisor integration (decomposed: test & verify)
**Depends on:** none (tools already implemented in c04c6f0)

## What to build

Add the four education tools (`education_profile`, `education_documents`, `education_goals`, `education_team`) to existing test suites so CI knows they exist, and write mocked unit tests that verify each tool handles success, misconfiguration, and not-found cases correctly. This is a test-only change — no new features, no server deployment.

## Context

The four tools bridge Iji to the Education Advisor Supabase database. They were built in commit c04c6f0 but never tested. All four use `src/utils/supabase.js` (a lightweight PostgREST client).

Key files:
- Tools: `src/tools/education-profile.js`, `education-documents.js`, `education-goals.js`, `education-team.js`
- Supabase client: `src/utils/supabase.js` — exports `query(table, params)` and `isConfigured()`
- Permissions: `src/utils/permissions.js` — education tools are gated by the `education` permission (lines 43-46)
- Capability prompt: `config/prompts/capabilities/education.md`
- Existing test patterns: `test/tool-registry.test.js`, `test/permissions.test.js` — follow these patterns exactly

## Implementation notes

### Part 1: Registry and permissions tests

In `test/tool-registry.test.js`:
- Add `'education_profile', 'education_documents', 'education_goals', 'education_team'` to the `expected` array
- Add `'education-profile', 'education-documents', 'education-goals', 'education-team'` to the `toolFiles` array

In `test/permissions.test.js`:
- Add a test: `education` permission allows all 4 education tools
- Add a test: users without `education` permission are denied

### Part 2: Tool unit tests

Create `test/education.test.js` with mocked Supabase responses. Use `vi.mock('../src/utils/supabase.js')` to mock the `query` and `isConfigured` functions.

**education_profile tests:**
- Mock `isConfigured` → `true`, mock `query('children', ...)` → returns `[{ name: 'TestChild', grade_level: '5th', profile_context: { clinical: { diagnoses: ['ADHD'] }, support: { accommodations: ['Extended time'] } }, learner_profile: { summary: 'Active learner', strengths: ['Math'], challenges: ['Writing'] } }]`
- Call `execute({ child_name: 'TestChild' })` — expect result with `name`, `grade_level`, `diagnoses`, `strengths`, `challenges`, no `error`
- Mock `isConfigured` → `false` — expect `{ error: ... }` about configuration
- Mock `query` → returns `[]` — expect error about no child found

**education_documents tests:**
- Mock `query('children', ...)` → `[{ id: 1, name: 'TestChild' }]`, mock `query('documents', ...)` → `[{ name: 'Report Card', category: 'performance_profile', doc_type: 'report_card', extracted_date: '2026-01-15', tags: [], subjects: [], content: 'Sample content' }]`
- Call `execute({ child_name: 'TestChild' })` — expect `total: 1`, `documents` array with `name`, `category`
- Call `execute({ search: 'IEP' })` — verify search param is passed to query
- Call `execute({})` with no params — should query all documents

**education_goals tests:**
- Mock child lookup → `[{ id: 1, name: 'TestChild' }]`, mock `query('goals', ...)` → `[{ type: 'North Star', description: 'Love of learning', status: 'active', execution_status: null, progress: null, target_date: null, assigned_to: [], parent_id: null }]`
- Call `execute({ child_name: 'TestChild' })` — expect `north_star`, `objectives`, `tactics` arrays
- Verify unknown child returns error

**education_team tests:**
- Mock `query('team_members', ...)` → `[{ name: 'Jane Smith', role: 'Teacher', organization: 'School', email: 'jane@school.edu', phone: null, status: 'active' }]`
- Call `execute({})` — expect `total: 1`, `team_members` array
- Call with `child_name` filter — verify it resolves child, fetches goals, and filters members

## Server requirements

None — test-only change. No env vars or deployment needed.

## Verification

These are unit tests with mocked data, not conversational tests. Verify by running:

```
npm test
```

All tests in `test/education.test.js`, `test/tool-registry.test.js`, and `test/permissions.test.js` must pass.

## Done when

- [ ] All 4 education tools listed in `test/tool-registry.test.js` expected and toolFiles arrays
- [ ] Permission tests cover education tools (allow + deny)
- [ ] `test/education.test.js` exists with mocked unit tests for all 4 tools
- [ ] Each tool has at minimum: happy path test, not-configured test, not-found test
- [ ] `npm test` passes with all new tests green
- [ ] Committed

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Education tools — test & verify" "In Review"
```

## Commit message

`test: add education tools to test suites with mocked unit tests`
