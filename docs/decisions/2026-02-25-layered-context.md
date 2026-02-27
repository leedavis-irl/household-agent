# Decision: Layered Context Architecture

**Date:** 2026-02-25
**Status:** Proposed
**Decider:** Lee (with Claude as advisor)

## Context

Every Claude API call in Iji loads the full `config/system-prompt.md` regardless of task type. HA control instructions load when someone asks about weather. Calendar instructions load when someone asks about lights. Research shows irrelevant context competes for attention and biases model behavior ("pink elephant problem").

The Osmani synthesis recommends a three-layer architecture: minimal routing file (always loaded), focused capability files (loaded selectively), and a maintenance process to keep it current.

## Decision

Replace monolithic system prompt with layered, task-scoped context:
- Layer 1: Core identity (~200 tokens, always loaded)
- Layer 2: Capability contexts (~100-300 tokens each, loaded by intent detection)
- Layer 3: Situational overlays (time-of-day, error recovery, new user)

Three implementation phases: extract/split (pure refactor), intent detection + selective loading, measurement.

## Consequences

- Foundation for prompt optimization loop (see 2026-02-25-prompt-optimization.md)
- Each capability prompt can be optimized independently
- Token savings proportional to how specialized each conversation is
- Requires changes to `src/brain/prompt.js`

## Full Spec

See downloaded deliverable `02-layered-context-spec.md` — to be placed at `specs/LAYERED-CONTEXT.md` when ready to implement.
