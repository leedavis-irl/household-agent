# Spec: Prompt Optimization Loop for Iji

**Purpose:** Build a lightweight version of the Arize Prompt Learning loop adapted for a single-household agent. Instead of SWE-bench, we use Iji's own conversation history as training data. The goal is to systematically discover what prompt instructions actually improve Iji's responses vs. what we *think* helps.

**Key insight from the research:** What humans think agents need in their prompt and what actually helps are often different. A 5% accuracy gain came from automated optimization of Claude Code's prompt — with no architecture, model, or tool changes.

**Decision record:** `docs/decisions/2026-02-25-prompt-optimization.md`

---

## How This Works for Iji

The Arize loop is: run agent → evaluate output → generate feedback → optimize prompt → repeat.

For Iji, we already have the first piece — every conversation is logged (Claude API calls with token counts in SQLite, Signal message history). We need to add evaluation and optimization.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Iji handles  │────▶│  Evaluate    │────▶│  Optimize    │
│  real messages│     │  responses   │     │  prompt      │
└──────────────┘     └──────────────┘     └──────┬───────┘
       ▲                                          │
       └──────────────────────────────────────────┘
                   deploy updated prompt
```

---

## Phase 1: Conversation Logging (build this first)

### What to capture

For every brain loop completion, log to a new SQLite table `conversation_evals`:

```sql
CREATE TABLE conversation_evals (
  id INTEGER PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  tools_called TEXT,           -- JSON array of tool names
  capabilities_loaded TEXT,    -- JSON array (from layered context spec)
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost_usd REAL,
  response_time_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  
  -- Evaluation fields (filled later, manually or by eval agent)
  quality_score INTEGER,       -- 1-5 scale
  quality_notes TEXT,          -- Why this score
  failure_category TEXT,       -- null if good, else: 'wrong_tool', 'bad_info', 'tone', 'hallucination', 'incomplete', 'too_verbose', 'permission_error'
  eval_source TEXT             -- 'human', 'llm_eval', 'implicit'
);
```

### Implicit evaluation signals (free data)

Some quality signals are automatic:
- **Follow-up correction:** If the user's next message corrects Iji ("no, I meant...", "that's wrong", "not that one"), score the previous response low
- **Conversation abandonment:** User doesn't reply after Iji's response (ambiguous — could be satisfied or gave up)
- **Tool error:** If a tool returned an error, the response was likely degraded
- **Re-ask:** User asks the same question again in a different way → previous response failed

Add a simple pattern matcher in `src/brain/conversation.js` that detects corrections and re-asks, and auto-scores the preceding response.

### Implementation

- New file: `src/utils/eval-logger.js` — writes to `conversation_evals` table
- Hook into `src/brain/index.js` — after the brain loop completes, log the full exchange
- New migration in `src/utils/db.js` — add the table

### Server Requirements
- [ ] No env vars needed
- [ ] No external service changes
- [ ] SQLite schema change (new table, handled by inline migration in db.js)

### Commit message
```
feat(eval): add conversation_evals table and logging

Logs every brain loop completion with user message, response, tools
called, token counts, and cost. Adds implicit quality signal detection
for corrections and re-asks. Foundation for prompt optimization loop.
```

---

## Phase 2: Batch Evaluation (weekly, semi-automated)

### The eval script

**File:** `scripts/eval-conversations.js`

Once a week, this script:
1. Pulls all conversations from the past 7 days that don't have a `quality_score`
2. For each, sends the user message + Iji's response + tools called to Claude with an evaluator prompt
3. Claude scores 1-5 and categorizes any failures
4. Writes scores back to `conversation_evals`

### Evaluator prompt

```markdown
You are evaluating a household AI assistant's response. The assistant is named Iji and serves as chief of staff for a family household.

**User message:** {{user_message}}
**Tools called:** {{tools_called}}
**Iji's response:** {{assistant_response}}

Rate this response 1-5:
5 = Perfect. Correct, concise, warm, used the right tools.
4 = Good. Minor issues (slightly verbose, could have used a tool but didn't).
3 = Adequate. Got the job done but with issues (wrong tone, missing context, extra steps).
2 = Poor. Wrong answer, wrong tool, confused, or unhelpful.
1 = Failure. Hallucination, permission violation, harmful, or completely wrong.

If score < 4, categorize the failure:
- wrong_tool: Used the wrong tool or missed an obvious tool
- bad_info: Returned incorrect information
- tone: Too formal, too verbose, or not warm enough
- hallucination: Made up information instead of using tools
- incomplete: Answered partially, missed part of the question
- too_verbose: Response was unnecessarily long for messaging context
- permission_error: Acted on something the user shouldn't have access to

Respond in JSON:
{"score": N, "category": "..." or null, "reasoning": "one sentence why"}
```

### Cost estimate

~100 conversations/week × ~500 tokens per eval = ~50K tokens/week ≈ $0.15/week on Sonnet. Negligible.

### Server Requirements
- [ ] Env var: `ANTHROPIC_API_KEY` (already present)
- [ ] Script should be runnable manually (`node scripts/eval-conversations.js`) and eventually via cron

### Commit message
```
feat(eval): add weekly conversation evaluation script

Runs Claude eval on unscored conversations from the past week.
Scores 1-5 with failure categorization. ~$0.15/week cost.
```

---

## Phase 3: Prompt Optimization (monthly)

### The optimizer script

**File:** `scripts/optimize-prompt.js`

Monthly (or when enough data accumulates), this script:

1. Pulls all evaluated conversations from `conversation_evals`
2. Groups by failure category
3. For each category with 3+ failures, generates a prompt improvement suggestion
4. Outputs a proposed diff to the relevant capability prompt file (from layered context spec)

### Meta-prompt for optimization

```markdown
You are optimizing the system prompt for a household AI assistant called Iji.

Here are {{N}} recent conversations where Iji scored below 4, grouped by failure type:

## {{failure_category}} failures ({{count}})

{{for each failure:}}
**User:** {{user_message}}
**Iji said:** {{assistant_response}}
**Eval:** {{quality_notes}}
{{end}}

Here is the current prompt section that governs this capability:
{{current_capability_prompt}}

Based on these failure patterns, suggest specific edits to the prompt that would prevent these failures. Rules:
- Only add instructions that address observed failures (not hypothetical ones)
- Keep additions under 50 words each
- If the failure is better fixed by changing code (adding a tool, fixing a bug), say so instead of a prompt change
- Output a unified diff of your proposed changes
```

### Human-in-the-loop

The optimizer outputs proposed changes to stdout / a markdown file. Lee reviews and approves. No auto-deployment of prompt changes.

**File:** `docs/prompt-optimization-log.md` — append-only log of what was changed, why, and what data drove it.

### Server Requirements
- [ ] Env var: `ANTHROPIC_API_KEY` (already present)
- [ ] Depends on layered context architecture (`config/prompts/capabilities/`)

### Commit message
```
feat(eval): add monthly prompt optimization script

Groups conversation failures by category, generates prompt improvement
suggestions via meta-prompting. Outputs proposed diffs for human review.
```

---

## Phase 4: Measure Impact

After deploying a prompt change:
1. Tag the change in the optimization log with a date
2. Compare quality scores for the affected capability in the week before vs. week after
3. If scores improve or hold: keep the change
4. If scores degrade: revert and log why

---

## Implementation Order

| Step | What | Files | Effort | Depends on |
|------|------|-------|--------|------------|
| 1 | Add `conversation_evals` table | `src/utils/db.js` | 30 min | Nothing |
| 2 | Add eval logger | `src/utils/eval-logger.js`, hook in `src/brain/index.js` | 1-2 hrs | Step 1 |
| 3 | Add implicit signal detection | `src/brain/conversation.js` | 1-2 hrs | Step 2 |
| 4 | Build eval script | `scripts/eval-conversations.js` | 2-3 hrs | Step 2 |
| 5 | Run first eval batch manually | — | 30 min | Step 4 |
| 6 | Build optimizer script | `scripts/optimize-prompt.js` | 2-3 hrs | Step 4 + layered context spec |
| 7 | First optimization cycle | — | 1 hr review | Step 6 |

Total: ~8-10 hours of implementation spread across a few sessions. Steps 1-4 can ship independently.
