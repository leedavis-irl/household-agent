# Education tools — test & verify

**Sphere:** Children
**Backlog item:** Education Advisor integration (decomposed: test & verify)
**Depends on:** none (tools already implemented in c04c6f0)

## What to build

Two things:

1. **Add the four education tools to existing test suites** (tool-registry, permissions) so CI knows they exist.
2. **Write unit tests for each tool's execute function** that verify the tools handle both success and error cases correctly, using mocked Supabase responses.

Tools: `education_profile`, `education_documents`, `education_goals`, `education_team`.
Source: `src/tools/education-profile.js`, `education-documents.js`, `education-goals.js`, `education-team.js`.
Supabase client: `src/utils/supabase.js`.
Permission mapping: `src/utils/permissions.js` (already wired).
Existing tests: `test/tool-registry.test.js`, `test/permissions.test.js`.

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

## Done when

- [ ] All 4 education tools listed in `test/tool-registry.test.js`
- [ ] Permission tests cover education tools (allow + deny)
- [ ] `test/education.test.js` exists with mocked unit tests for all 4 tools
- [ ] Each tool has at minimum: happy path test, not-configured test, not-found test
- [ ] `npm test` passes with all new tests green
- [ ] Committed

## Commit message

`test: add education tools to test suites with mocked unit tests`
