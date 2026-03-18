# Populate GitHub Project from Backlog

**Sphere:** Engine
**Backlog item:** GitHub Project bulk import (one-time setup)
**Depends on:** gh CLI authenticated with `project` scope, GitHub Project #2 exists

## What to build

A one-time script that reads unbuilt capabilities from `BACKLOG.md` and creates draft cards in GitHub Project #2, so the project board reflects the full scope of work without manual card creation. This is a utility — run once, then the script is done.

## Context

GitHub Project #2 exists under user `leedavis-irl` with custom fields: **Status**, **Project**, **Spheres**, **Short Summary**. The backlog is in `BACKLOG.md` at the repo root, organized into numbered sections (spheres) with capabilities tables. Each row has a status column — we only care about rows marked `❌ Not built`.

Nine cards were already created manually and must be skipped by title match:
1. Household conflict detection
2. Morning briefing opt-in/out
3. Morning briefing + Trello tasks
4. Multi-person scheduling negotiation
5. Slack channel adapter
6. Email as a channel (inbound/outbound)
7. Voice channel adapter
8. Draft email for review
9. Room tablets (Peninsula-style)

## Implementation notes

Create `scripts/populate-project.sh` (or `.js`):

1. Run `gh auth status` — abort if not authenticated or missing scopes.
2. Query GitHub GraphQL to discover Project #2's node ID and field IDs for Status, Project, Spheres, Short Summary. Print discovered IDs for confirmation.
3. Parse `BACKLOG.md` — for each sphere section, extract capability rows where Status = `❌ Not built`. Capture capability name, sphere, and Notes column (truncated to one sentence as Summary).
4. Skip cards matching the 9 pre-existing titles above.
5. For each remaining capability, create a draft item via `addProjectV2DraftIssue` mutation with the capability name as title. Set fields: Status → Backlog, Project → Iji, Spheres → sphere name, Short Summary → the notes.
6. Log each created card. On errors, log and continue.
7. Print summary: total parsed, skipped, created, failed.

Use `gh api graphql` for all API calls. Idempotency not required — this is a one-time bulk import.

## Server requirements

None — runs locally from the Mac Mini. Requires `gh` CLI with `project` and `read:org` scopes.

## Verification

- Run the script and verify it creates draft cards in Project #2
- Spot-check 3-5 cards in the GitHub Project UI — correct title, sphere, summary, status
- Confirm the 9 pre-existing cards are not duplicated

## Done when

- [ ] Script exists at `scripts/populate-project.sh` (or `.js`)
- [ ] Running it creates draft cards for all unbuilt capabilities in BACKLOG.md
- [ ] Pre-existing cards are skipped (no duplicates)
- [ ] Each card has Status=Backlog, Project=Iji, correct Sphere, and Summary populated
- [ ] Committed

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Populate GitHub Project from Backlog" "In Review"
```

## Commit message

`feat: add script to populate GitHub Project from BACKLOG.md`
