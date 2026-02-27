# Spec: Context File Audit — Strip Discoverable Content

**Purpose:** Reduce token overhead and context rot in Iji's documentation files by removing information that Claude/Cursor can discover by reading the code. Based on research showing auto-generated/redundant context degrades agent performance by 2-3% and inflates cost by 20%+.

**Principle:** Every line in a context file should represent information that is NOT already in the repo. If the agent can find it by listing directories and reading source files, delete it.

---

## Files to Audit

### 1. `ARCHITECTURE.md` — HEAVY TRIM

This is the biggest offender. It's ~400 lines and most of it duplicates what's in the code.

**DELETE these sections entirely:**

- **Project Structure tree** (lines showing `src/broker/`, `src/tools/`, etc.) — Cursor discovers this with a directory listing. The tree is also already stale (missing files like `email-search.js`, `email-read.js`, `weather-query.js`).
- **Tech Stack bullet list** — Every dependency is in `package.json`. Every integration is visible from imports. The one exception is signal-cli setup (keep that — see below).
- **Implementation Order (Phases 1-5)** — Historical artifact. Iji is past Phase 3. This is dead weight in every context window.
- **Configuration: household.json example** — The actual file is in `config/household.json` and is the source of truth. The example in ARCHITECTURE.md is already outdated (missing members, missing permission types).
- **System Prompt Template section** — The real prompt is in `config/system-prompt.md`. Having a stale copy in ARCHITECTURE.md means two sources of truth competing for attention.

**KEEP these sections (landmines the agent cannot discover):**

- **Core Principles** ("Identity first, context on demand", "Many front doors, one brain", "Acknowledge and work", "Tools, not pre-fetch") — These are design philosophy that shapes decisions. Not in the code.
- **Iji's 14 Departments** — This is the product vision / scope definition. Useful for understanding what's in-scope vs out-of-scope. Not discoverable from code.
- **Architecture: Four Flows** — The envelope format, brain loop description, and flow explanations. Keep but trim: remove the pseudocode that mirrors actual code, keep the conceptual explanation of HOW the flows connect.
- **Signal account details** — The Google Voice number, the warning about never sharing signal-cli between processes, the ratcheting protocol corruption risk. This is a genuine landmine.
- **Open Decisions section** — Keep "Passive listening" behavior description (Claude decides whether to respond in groups). This is system-prompt-level guidance, not code-discoverable.
- **Relationship to Existing Projects** — Keep the note about superseding `claude-home-agent` and the Monarch integration absorption plan. These are strategic context.

**Estimated reduction:** ~400 lines → ~150 lines. Every Claude/Cursor call against this repo loads this file. That's ~250 lines of pure overhead eliminated from every session.

### 2. `.cursorrules` — LIGHT TRIM

This file is actually well-written — mostly landmines and non-obvious rules. Minor changes:

**DELETE:**
- The "Project Overview" paragraph at the top. Cursor can read `package.json` and the repo name.
- The "Architecture" section that re-describes the four flows, tool file shape, and directory layout. This duplicates ARCHITECTURE.md AND the code itself. Triple redundancy.

**KEEP everything else** — The 8 Engineering Laws are all genuine landmines (envelope rule, reply address rule, permission rule, pattern rule, env rule, scope rule, log rule, superset rule). The "Common Mistakes to Avoid" section is exactly the kind of content that helps. The code style section is fine (ES modules, no classes, kebab-case).

**REWRITE the top** to be a routing document:
```
# Iji — Cursor Rules

Read ARCHITECTURE.md for design philosophy and scope.
Read DEV-PROTOCOL.md for the build cycle.
Read the spec in specs/ for the current task before touching code.
Look at 2-3 existing files in the same directory before creating new ones.

## Engineering Laws
[keep existing laws]
```

### 3. `DEV-PROTOCOL.md` — KEEP AS-IS

This is almost entirely non-discoverable process knowledge: the roles, the build cycle, the verification steps, the vaccination pattern, the spec tightness guide. None of this is in the code. This file is a model of what context docs should be.

One small change: the "What This Protocol Would Have Caught" section at the bottom is historical. Move it to a post-mortem doc or delete it. It served its purpose.

### 4. `GROWTH-PROTOCOL.md` — KEEP AS-IS

Same reasoning. Product evaluation framework, three-product rule, the evaluation levels, privacy principles — all non-discoverable decision-making guidance. This file is clean.

### 5. `BACKLOG.md` — KEEP AS-IS

This is the source of truth for what to build. Not code-discoverable.

### 6. `STATUS.md` — KEEP AS-IS

Auto-generated health check output. Useful, not redundant.

### 7. `config/system-prompt.md` — REVIEW BUT DON'T TRIM

This is the runtime prompt that goes to Claude API. Every word here costs tokens on every single user message. It's already reasonably tight. Flag for future optimization via the prompt learning loop (see `specs/PROMPT-OPTIMIZATION.md`).

---

## Cursor Instructions

Open the household-agent repo in Cursor. Execute these changes in order:

### Step 1: Trim ARCHITECTURE.md

Delete the following sections entirely:
- "Project Structure" (the directory tree)
- "Tech Stack" (keep only the Signal-specific paragraphs about signal-cli paths, Google Voice number, and the "never share signal-cli" warning — move these to a new "## Landmines" section at the bottom)
- "Implementation Order" (Phases 1-5)
- "Configuration: household.json" (the example JSON block)
- "System Prompt Template" (the template block)

In the "Architecture: Four Flows" section, remove code examples and pseudocode that duplicate what's in `src/`. Keep the prose descriptions of how the flows connect.

### Step 2: Rewrite .cursorrules header

Replace the "Project Overview" and "Architecture" sections with the routing block shown above.

### Step 3: Clean up DEV-PROTOCOL.md

Move the "What This Protocol Would Have Caught" section to `docs/post-mortems/2025-initial-launch-lessons.md`. Remove it from DEV-PROTOCOL.md.

### Step 4: Verify nothing broke

- `npm test` (if tests exist)
- Read through the trimmed ARCHITECTURE.md to confirm it still makes sense as a standalone document
- Confirm .cursorrules still contains all 8 Engineering Laws

### Commit message
```
refactor(docs): strip code-discoverable content from context files

Based on ICSE JAWs 2026 and ETH Zurich research showing redundant
context files degrade agent performance 2-3% and inflate cost 20%+.
Removed directory trees, tech stack lists, code examples, and stale
configuration samples that duplicate information already in the codebase.
Kept design philosophy, landmines, and process knowledge.
```
