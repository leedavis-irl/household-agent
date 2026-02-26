# Iji Development Protocol

How we go from "build this" to "this works in production." Applies to every code change — features, bugfixes, refactors.

## Roles

| Role | Who | Does |
|------|-----|------|
| **Product** | Lee (CTO) + domain contributors (e.g., Hallie) | Decides what, prioritizes, acceptance-tests in the real world |
| **Engineer** | Claude (chat) | Writes specs, reviews code, debugs architecture issues, owns quality |
| **Dev** | Cursor | Implements specs, writes tests, commits and pushes |

Engineer writes specs tight enough that Dev can execute without guessing, but loose enough that Dev can make implementation decisions. Engineer never writes vague specs and blames Dev for the result.

---

## The Build Cycle

### 1. Spec (Engineer)

Every change gets a spec in `specs/` before Cursor touches code. Two documents per change:

**a) Spec** (`specs/W2S4-finance-tools.md`)
- What and why
- Interface contract (tool name, params, return shape)
- Files to create/modify
- Server requirements checklist
- Commit message

**b) Verification Checklist** (`specs/W2S4-finance-tools.verify.md`)
- Concrete test scenarios with expected outcomes
- Regression checks (what must NOT break)
- Server confirmation steps

Spec format varies by change type (see Tightness Guide below).

### 2. Implement (Dev / Cursor)

Cursor reads the spec, reads ARCHITECTURE.md, implements. Cursor must:

- Follow existing patterns (look at sibling files before inventing new patterns)
- Run `npm test` if tests exist
- Not modify files outside the spec's scope without flagging it
- **Always branch off `main`** — run `git checkout main && git pull` before creating the feature branch
- Commit with the specified message and push to a **feature branch** (`feature/short-name`)
- Open a pull request against main

### 3. Verify Locally (Engineer or Dev)

Before deploy, confirm the change works locally if possible:
- For tool changes: `node src/index.js` → test via CLI
- For broker/router changes: test with a real Signal message locally if signal-cli is available
- For infra changes: review the diff

If local verification isn't possible (e.g., EC2-only dependencies), note this in the spec and plan for server-side verification.

### 4. Review + Merge (Engineer + Product)

Before merging the feature branch to main:
- Engineer reviews the diff against the spec (changes match, no scope creep, no hardcoded secrets/paths)
- Product confirms the spec reflects what they want
- Merge to main triggers deploy

See `docs/decisions/2026-02-26-feature-branch-review.md` for the full review model.

**Exceptions:**
- **Hotfixes:** Urgent production fixes (Iji is down) can go direct to main. Post-mortem required within 24 hours.
- **Documentation-only changes:** Backlog updates, specs, decision records, and other markdown-only changes that don't affect deployed code can go straight to main. No branch or PR needed.

### 5. Deploy (Automated)

Merge to main triggers CI/CD. GitHub Actions deploys to EC2, runs health check, rolls back on failure. No manual deploys unless CI is broken.

### 6. Server Confirmation (Engineer + Product)

**This is the step we've been skipping.** After CI reports success:

1. **Engineer checks logs**: `journalctl -u iji.service --no-pager -n 30` — look for startup errors, auth failures, missing env vars
2. **Engineer verifies env**: if the spec added env vars, confirm they're on the server
3. **Product tests for real**: Lee sends a real Signal message (or group message) that exercises the new/fixed capability
4. **Engineer reviews the response logs**: confirm the right code path executed, no errors

A feature is not done until step 6 passes. "Code is on main" ≠ "feature works."

### 7. Close-Out (Engineer)

After server confirmation passes:
- Mark the spec status as **Complete**
- If anything broke or surprised us → write a post-mortem and **vaccinate the templates**

---

## Vaccinate the Templates

*Borrowed from EducationAdvisor. This is how we get smarter over time.*

**Trigger:** Immediately after writing a post-mortem.

**Process:**
1. Read the root cause from the post-mortem
2. Identify which phase failed (spec? implementation? server config? testing?)
3. Update the relevant template to prevent recurrence:
   - Spec gap → update `docs/templates/spec.md`
   - Testing gap → update `docs/templates/verify.md`
   - Server config gap → update this protocol's Server Requirements section
   - Cursor mistake → update `.cursorrules`

**Goal:** Every bug permanently makes the system smarter. Templates evolve. The same class of bug never happens twice.

---

## Spec Tightness Guide

| Change type | Spec tightness | Why |
|---|---|---|
| Simple bugfix (null pointer, typo) | **Prescriptive** — tell Cursor exactly what to change | Prevent wandering refactors on a 2-line fix |
| New tool (following existing pattern) | **Interface-tight, implementation-loose** — define the tool name/params/returns, let Cursor decide internals | Cursor is good at following patterns from sibling files |
| Architecture change (new broker, new flow) | **Detailed with rationale** — explain the design, why alternatives were rejected, provide pseudocode | Cursor needs guardrails on structural decisions |
| Refactor | **Exhaustive file list, behavioral contract** — every file, every rename, assert nothing changes | Refactors have the highest blast radius |

---

## Server Requirements Checklist

Every spec that touches server config includes this section, filled in:

```markdown
## Server Requirements
- [ ] Env var `EXAMPLE_KEY` added to EC2 `.env`
- [ ] Env var added to `.env.example` (for documentation)
- [ ] Dependency installed (handled by CI `npm ci` if in package.json)
- [ ] Config change in `config/household.json` (deployed via git)
- [ ] External service account created (Lee's fingers required)
- [ ] Data file or directory created on server
```

Engineer tracks these. After CI deploys code, Engineer reminds Product to apply manual server changes before testing.

---

## Post-Mortem Protocol

**Trigger:** Any bug that reaches production, any feature that fails server confirmation, any incident that costs >30 minutes of debugging.

**File:** `docs/post-mortems/YYYY-MM-DD-short-name.md`

**Template:**

```markdown
# Post-Mortem: [Short Name]

**Date:** YYYY-MM-DD
**Severity:** Low / Medium / High
**Time to fix:** [duration]

## What Happened
[1-2 sentences]

## Root Cause
[Technical explanation]

## Fix
[What was changed]

## What Our Process Should Have Caught
[Which step in the build cycle failed or was skipped?]

## Template Vaccination
[What was added to which template/rule to prevent recurrence]
```

---

## Research-to-Repo Rule

When a conversation with Claude produces actionable recommendations:
1. Claude creates deliverable files (specs, decision records, or backlog items) and writes them directly to the repo
2. Actionable items get backlog entries with links to the decision record
3. The chat is disposable — the repo is the record

If a recommendation isn't worth putting in the repo, it wasn't worth the conversation. Decision records go in `docs/decisions/` per the ADR pattern (`docs/decisions/2026-02-25-adr-pattern.md`).

---

## Anti-Patterns

- **"Ship and forget"** — pushing to main without server confirmation
- **"Works locally"** — local Mac ≠ EC2 (different signal-cli versions, env vars, file paths)
- **Vague specs that blame Cursor** — if the spec was ambiguous, the bug is the Engineer's fault
- **Cursor-driven refactors** — Cursor should not restructure code beyond what the spec asks. If it suggests a better approach, it flags it; Engineer decides.
- **Skipping the spec for "quick fixes"** — quick fixes without specs become long debugging sessions
- **Not vaccinating** — fixing a bug without updating templates means it will happen again
