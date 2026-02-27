# ADR: Feature Branches and Pre-Deploy Review

**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Lee, Claude (Engineer)

## Context

With Hallie joining as a Product contributor, Cursor will be implementing specs from multiple people. The current model — push directly to main, CI auto-deploys — is safe when every commit is reviewed by Lee and the Engineer before Cursor touches code. But with more contributors generating specs and Cursor prompts, we need a review checkpoint between "code complete" and "live in production."

Additionally, Lee and the Engineer need a consistent flow for reviewing changes before they go live, rather than ad-hoc verification.

## Decision

### 1. Feature branches for all new work

Cursor commits to a feature branch, not main. Branch naming: `feat/short-name` (e.g., `feat/morning-briefings-v1`, `feat/conflict-detection`).

### 2. PR review before merge

Every feature branch gets a pull request. The PR must be reviewed before merging to main. Review can be done by:
- **Lee** (Product approval + technical review)
- **Engineer (Claude in a chat session)** — Lee opens a session, shares the PR diff or branch, Engineer reviews against the spec

Both is ideal. At minimum, one of the two.

### 3. Merge to main triggers deploy (unchanged)

The CI/CD pipeline stays the same. Push to main → GitHub Actions → deploy via Tailscale → health check. The only change is that pushes to main now come from PR merges, not direct commits.

### 4. Review checklist

When reviewing a PR, check:
- [ ] Changes match the spec (no scope creep, no missing pieces)
- [ ] Files modified are only those listed in the spec
- [ ] No hardcoded secrets, paths, or Mac-specific assumptions
- [ ] Commit message matches spec
- [ ] Server requirements from spec are addressed (env vars, config, etc.)

### 5. Exceptions to branch requirement

- **Hotfixes:** For urgent production fixes (Iji is down, messages aren't sending), Lee can push directly to main. A post-mortem is required within 24 hours per DEV-PROTOCOL.md.
- **Documentation-only changes:** Backlog updates, specs, decision records, and other markdown-only changes that don't affect deployed code can go straight to main. No branch or PR needed. These don't trigger meaningful CI behavior and can't break production.

## Alternatives Considered

**Keep direct-to-main (rejected):** Risk of deploying untested changes grows with more contributors. One bad push at 10pm means Iji is broken until someone notices.

**Require two human reviewers (rejected):** Overhead too high for a household project. One reviewer is sufficient given that every change has a spec.

**Branch protection rules in GitHub (deferred):** Enforcing PR requirements via GitHub settings is a good future step but not needed yet. Trust-based for now.

## Consequences

- Slightly slower path from "code done" to "live" (PR review adds a step)
- Much safer — nothing reaches production without a review
- Contributors can work asynchronously — Cursor pushes a branch, review happens when Lee is available
- Lee and Engineer need a consistent "review session" workflow (open a Claude chat, share the diff, review against spec)
