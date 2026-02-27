# Decision: Prompt Optimization Loop

**Date:** 2026-02-25
**Status:** Proposed
**Decider:** Lee (with Claude as advisor)

## Context

Arize AI showed a 5% accuracy improvement on Claude Code by running an automated prompt optimization loop: run agent → evaluate output with LLM → meta-prompt to refine instructions → repeat. 11% improvement when optimized for a single repo.

Currently Iji's prompt improvements happen when Lee notices something wrong in Signal and mentions it in a chat with Claude. This is biased (only Lee's conversations), unsystematic, and untracked.

## Decision

Build a lightweight prompt optimization loop using Iji's own conversation history:
1. Log all conversations to `conversation_evals` SQLite table (with evaluation fields)
2. Auto-detect implicit quality signals (corrections, re-asks, tool errors)
3. Weekly batch evaluation via LLM eval script (~$0.15/week)
4. Monthly prompt optimization via meta-prompting script
5. Human-in-the-loop: Lee reviews and approves all prompt changes

## Consequences

- Every conversation contributes to prompt improvement data
- Prompt changes are tracked with rationale in `docs/prompt-optimization-log.md`
- Pairs with layered context architecture (each capability optimized independently)
- Step 1 (eval table + logger) ships independently and starts collecting data immediately

## Implementation

See downloaded deliverable `03-prompt-optimization-plan.md` — to be placed at `specs/PROMPT-OPTIMIZATION.md` when ready to implement. Steps 1-4 estimated at ~8-10 hours total.

## Sources

- https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/
- https://github.com/Arize-ai/prompt-learning
