# Iji Growth Protocol

How we evaluate, select, and build new capabilities for Iji. This document is binding — every integration decision and every backlog step that touches external products must follow this protocol.

---

## Core Principles

### 1. Open source first, self-hosted preferred

If an open-source, self-hostable option exists that meets our needs, it wins by default over a commercial SaaS. We control our data, our uptime, and our upgrade path. Paid services are acceptable only when they deliver clearly more value than the self-hosted alternative AND don't create a hard dependency.

### 2. Privacy is non-negotiable

Iji operates in the middle of a family's life. Every integration must be evaluated for what data leaves our infrastructure. Questions to always ask:

- Does this service see message content, calendar details, or financial data?
- Is data stored on their servers? For how long? Under what terms?
- Can we use the service with only the minimum data needed (e.g., tracking number without linking to identity)?
- Is there a self-hosted alternative that keeps everything local?

If a service requires sending household data to a third party and a local alternative exists, the local alternative wins even if it's harder to set up.

### 3. Security by default

- API keys and tokens are stored in `.env`, never in code or config files.
- OAuth tokens are scoped to minimum required permissions.
- Reverse-engineered APIs are acceptable — we're not afraid of them — but they must be isolated in standalone client modules so breakage doesn't cascade.
- Session-based auth (cookies, fragile tokens) gets a health-check wrapper that alerts on failure rather than silently breaking.
- Every tool that writes data (sends email, creates events, controls devices) requires explicit permission checks per the existing permission framework.

### 4. Reverse engineering is a valid strategy

If a service we use doesn't have a public API but does have a web interface, reverse engineering their internal API is on the table. We've already done this with Monarch Money. Safeway is next. The approach:

1. Sniff requests via browser devtools
2. Document the endpoints, auth mechanism, and payload format
3. Build a standalone client module (not coupled to Iji)
4. Add a health-check that detects when the API changes
5. Wrap as Iji tool only after the client is stable

### 5. Lee is Head of Product, not Head of Engineering

Claude (in conversations like this one), Cursor (for implementation), and eventually Iji itself handle as much development as possible. Lee makes product decisions: what to build, what to prioritize, what tradeoffs to accept. Lee does not write boilerplate, debug integration quirks, or manually test APIs unless there is a physical-world requirement (e.g., scanning a QR code, plugging in hardware).

**What requires Lee's fingers:**
- OAuth consent flows in a browser (click "Allow")
- Hardware setup (plugging in microphones, mounting tablets)
- Household discussions about privacy/permissions
- Final approval on anything that writes to the outside world (sends email, posts to Slack, controls devices in a new way)

**What does NOT require Lee's fingers:**
- Writing and testing tool implementations
- Debugging API integrations
- Writing prompts and testing brain behavior
- Setting up infrastructure (databases, cron jobs, config files)
- Evaluating products (Claude can read docs, GitHub issues, Reddit threads)

---

## Product Evaluation Framework

Every time the backlog says "evaluate per Growth Protocol" or any time we're deciding between build vs. integrate, we follow this framework.

### The Three-Product Rule

Never commit to a product based on one option. Always evaluate **three candidates** for any integration point. If fewer than three exist, that's a signal that the space is immature and building custom may be the right call.

### Evaluation Levels

#### Level 1 — Name & Fit (5 minutes)

What it is: Surface-level identification. We know the product name, what it claims to do, and whether it's conceptually relevant.

What we check:
- Does this product address the capability we need?
- Is it open source? Self-hostable? What's the license?
- Is it actively maintained? (Last commit date, release cadence)
- What's the pricing model? Free tier limits?
- Does it have an API at all?

Output: A one-line summary per candidate. Example: "Monica — open source self-hosted personal CRM, PHP/Laravel, active development, full REST API, AGPL-3.0."

When to stop here: If all three candidates clearly fail on core principles (no API, closed source only, sends all data to cloud with no self-host option), stop and build custom.

#### Level 2 — Documentation & Community Review (30-60 minutes)

What it is: We actually read the docs and check what real users say.

What we check:
- **API documentation**: Does the API cover what we need? Are there endpoints for the specific operations we want? Are there rate limits that would block our use case?
- **Authentication**: What auth does the API require? OAuth, API key, session cookie? How painful is setup?
- **Data model**: Does their data model map to our needs, or would we spend more time adapting than building?
- **GitHub issues**: Search for open issues related to our use case. Look for patterns of breakage, unresponsive maintainers, or fundamental architecture problems.
- **Reddit/forum threads**: Search `reddit.com/r/selfhosted`, `reddit.com/r/homelab`, `reddit.com/r/homeassistant`, and relevant subreddits for real user experiences. Look for "I switched away from X because..." threads — they reveal the gotchas.
- **Integration ecosystem**: Does it play well with our stack? Node.js client library? Docker deployment? Has anyone integrated it with Home Assistant or Claude?

Output: A structured evaluation per candidate covering: API coverage, auth complexity, data model fit, community health, known gotchas, and a recommendation (proceed to Level 3 / use it / skip it).

When to stop here: If a clear winner emerges that meets all our principles and the API covers our needs, commit and build the integration.

#### Level 3 — Proof of Concept Spike (2-4 hours)

What it is: Actually run the product, hit the API, and validate that it works for our specific use case before committing to a full integration.

What we do:
- Stand up the product (Docker, local install, or create a free account)
- Make real API calls that mirror our intended usage
- Test the specific operations we need (not just "does the API respond" but "can we create the exact query/mutation we need")
- Measure response times, data format, and error handling
- Identify any deal-breakers that weren't visible in docs (e.g., API returns data in a format that doesn't match docs, auth tokens expire every hour, rate limits are stricter than documented)
- Write a standalone test script that can be re-run to verify the integration still works

Output: A working proof-of-concept script and a go/no-go recommendation with specific findings. If go: the spike becomes the foundation of the actual tool implementation. If no-go: document why so we don't revisit the same dead end.

When to use Level 3: When the integration is complex (OAuth, reverse-engineered API, self-hosted deployment), when we're choosing between two close candidates after Level 2, or when the integration is foundational (something many future tools will depend on).

---

## Decision Record Template

Every integration decision gets a brief record in the backlog or a linked document. Format:

```markdown
### Decision: [Capability Name]
**Date:** YYYY-MM-DD
**Decision:** Build custom / Integrate with [Product] / Defer
**Candidates evaluated:**
1. [Product A] — [one-line summary] — Level [1/2/3] — [verdict]
2. [Product B] — [one-line summary] — Level [1/2/3] — [verdict]
3. [Product C] — [one-line summary] — Level [1/2/3] — [verdict]
**Rationale:** [Why this choice, what tradeoffs we accepted]
**Risks:** [Known gotchas, fragility, future migration concerns]
```

---

## Development Workflow

### Who does what

| Role | Actor | Responsibilities |
|------|-------|-----------------|
| **Head of Product** | Lee | Prioritization, product decisions, approval of write-access capabilities, household discussions, physical-world tasks |
| **Architect / Advisor** | Claude (conversations) | Architecture decisions, backlog grooming, product evaluation (Levels 1-2), Growth Protocol enforcement, code review |
| **Implementer** | Cursor (Claude Code) | Writing tool implementations, tests, debugging, infrastructure setup, config changes |
| **Self-Improver** | Iji (future) | Proposing new tools, identifying gaps, drafting implementations for review, running health checks |

### Implementation flow for a new capability

1. **Lee decides** what to build next (or Claude proposes based on backlog priorities)
2. **Claude evaluates** integration options per Growth Protocol (Levels 1-3 as needed)
3. **Lee approves** the approach (build custom, integrate with X, or defer)
4. **Cursor implements** the tool, guided by ARCHITECTURE.md patterns and existing tool code
5. **Lee tests** via Signal/CLI with real household scenarios
6. **Claude reviews** the implementation for security, error handling, and architecture compliance

### When Iji reaches Wave 10 (Meta-Cognition), steps 2 and 4 start shifting to Iji itself.

---

## Recurring Health Checks

For every integration that depends on an external service:

- **API health check**: Automated ping on startup and every 6 hours. Log failures. Alert Lee via Signal if a service is down for >1 hour.
- **Auth health check**: For session-based auth (Monarch, Safeway), verify the session is still valid. Re-auth or alert on failure.
- **Breaking change detection**: For reverse-engineered APIs, compare response schemas against known-good snapshots. Flag unexpected changes.
- **Dependency audit**: Monthly check that all npm dependencies are up to date and free of known vulnerabilities.

---

## Anti-Patterns to Avoid

These are mistakes we've seen (or nearly made) and want to prevent:

1. **"Just use X, it's popular"** — Popularity is not evaluation. Follow the levels.
2. **Sunk cost integration** — If an integration is fighting us after Level 3, cut it. Don't spend 20 hours making a bad fit work.
3. **Cloud creep** — Every new cloud service is a privacy surface and a dependency. Count them. Question each one.
4. **Over-building custom** — If a product does 80% of what we need with a clean API, use it. Don't build from scratch for the last 20%.
5. **Skipping the spike** — For anything involving OAuth, reverse-engineered APIs, or self-hosted deployment, always do Level 3. The docs lie.
6. **Lee writing boilerplate** — If Lee is writing implementation code, something has gone wrong. Redirect to Cursor.
