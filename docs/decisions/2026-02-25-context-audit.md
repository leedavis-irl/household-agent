# Decision: Context File Audit

**Date:** 2026-02-25
**Status:** Proposed
**Decider:** Lee (with Claude as advisor)

## Context

Research from ICSE JAWs 2026 (Lulla et al.) and ETH Zurich shows that redundant context in AGENTS.md/CLAUDE.md files degrades agent performance by 2-3% and inflates cost by 20%+. Addy Osmani's synthesis: "Can the agent discover this by reading the code? If yes, delete it."

Iji's ARCHITECTURE.md is ~400 lines, most of which duplicates code-discoverable information (directory trees, tech stack, config examples, implementation phases). This is loaded into every Cursor and Claude Code session against this repo.

## Decision

Audit all context files in the repo. Strip everything the agent can discover from the code. Keep only landmines, design philosophy, and process knowledge.

## Implementation

See `specs/CONTEXT-AUDIT.md` for Cursor-executable instructions.

## Sources

- https://addyosmani.com/blog/agents-md/
- https://arxiv.org/abs/2601.20404 (Lulla et al., ICSE JAWs 2026)
- https://arxiv.org/abs/2602.11988 (ETH Zurich)
