# Queue Spec: Populate GitHub Project from Backlog

## Goal

Automate the creation of draft cards in GitHub Project #2 (user: `leedavis-irl`) from unbuilt capabilities in `BACKLOG.md`, so the project board reflects the full scope of work without manual card creation.

## Prerequisites

- `gh` CLI authenticated with sufficient scopes (`project`, `read:org`)
- GitHub Project #2 exists under user `leedavis-irl` with custom fields: **Status**, **Project**, **Iji Sphere**, **Summary**

## Script Behavior

### Step 1: Verify `gh` auth status

- Run `gh auth status` and abort with a clear error if not authenticated or missing required scopes.

### Step 2: Discover project field IDs via GraphQL

- Query the GitHub GraphQL API to find Project #2 for user `leedavis-irl`.
- Extract the project's node ID and the field IDs for:
  - **Status** (single-select) — need the option ID for `Backlog`
  - **Project** (single-select) — need the option ID for `Iji`
  - **Iji Sphere** (single-select) — options map to BACKLOG.md section names (e.g., "Scheduling & Coordination", "Communication", etc.)
  - **Summary** (text field)
- Print discovered field IDs for confirmation before proceeding.

### Step 3: Parse BACKLOG.md

- Read `BACKLOG.md` from the repo root.
- For each of the 15 numbered sections (spheres), parse the capabilities table.
- Extract every capability row where Status = `❌ Not built`.
- For each, capture:
  - **Capability name** (first column)
  - **Sphere** (section heading, e.g., "Scheduling & Coordination")
  - **Summary** — the `Notes` column content, truncated to one sentence if needed. If Notes is empty, use the capability name as the summary.

### Step 4: Skip existing cards

The following 9 cards were already created manually and must be skipped (match by capability name):

1. Household conflict detection
2. Morning briefing opt-in/out
3. Morning briefing + Trello tasks
4. Multi-person scheduling negotiation
5. Slack channel adapter
6. Email as a channel (inbound/outbound)
7. Voice channel adapter
8. Draft email for review
9. Room tablets (Peninsula-style)

### Step 5: Create draft cards

For each remaining unbuilt capability:

1. Create a draft item in Project #2 using the `addProjectV2DraftIssue` mutation with the capability name as the title.
2. Update the item's fields:
   - **Status** → `Backlog`
   - **Project** → `Iji`
   - **Iji Sphere** → the sphere name from the section heading
   - **Summary** → the one-sentence summary from step 3
3. Log each created card (capability name + sphere) to stdout.
4. On GraphQL errors, log the error and continue to the next card (don't abort the whole run).

## Output

- Print a summary at the end: total parsed, skipped, created, failed.

## Implementation Notes

- Use `gh api graphql` for all GitHub API calls.
- Script language: bash or Node.js (either is fine).
- Idempotency: the script is designed for a one-time bulk import. If re-run, it will create duplicates — a duplicate check by title could be added but is not required for v1.
- Rate limiting: GitHub GraphQL has a 5000-point budget per hour. Each draft card creation is ~2 mutations. With ~70 unbuilt capabilities minus 9 skipped ≈ ~61 cards ≈ ~122 mutations, well within limits.
