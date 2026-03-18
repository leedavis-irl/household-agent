# Parenting methods for Iji to reference

**Sphere:** Children
**Backlog item:** Parenting Methods for Iji to reference
**Depends on:** education_profile, education_documents, web_search

## What to build

A new `parenting` capability that lets household adults ask Iji for parenting advice grounded in two specific coaching frameworks the family follows: **Good Inside** (Dr. Becky Kennedy) and **BratBusters** (Lisa Bunnage). When answering parenting questions, Iji should draw on these coaches' core principles AND pull in child-specific context from Education Advisor — diagnoses, neuropsych evaluations, accommodations, strengths, challenges — so advice is tailored to each child rather than generic. The result is a Chief of Staff who can say "Given that Logan has ADHD and executive function challenges, Dr. Becky would suggest..." rather than just "Try setting clear boundaries."

## Context

- Capability prompt system: `src/brain/prompt.js` registers capabilities in `capabilityFiles` (line 13-29) and `CAPABILITY_TRIGGERS` (line 31-46). Each capability is a markdown file in `config/prompts/capabilities/` split by `\n---\n` into a user-facing description and system guidelines.
- Education tools already exist: `education_profile` returns diagnoses, accommodations, strengths, challenges, psychometrics. `education_documents` can search for neuropsych reports, report cards, and teacher notes.
- Web search exists: `web_search` can look up specific coaching advice in real-time.
- Knowledge store exists: `knowledge_store`/`knowledge_search` can persist family-specific parenting notes.

### Coaching frameworks to embed

**Good Inside (Dr. Becky Kennedy):**
- Kids are good inside — behavior is a window into feelings, not a reflection of character
- Connection before correction — repair the relationship before addressing the behavior
- "Two things are true" — hold space for complexity ("I love you AND this behavior isn't OK")
- Validate feelings, set boundaries — feelings are always allowed, actions have limits
- Most Generous Interpretation (MGI) — assume the best about your child's intentions
- Sturdy leadership — be the calm, confident anchor your child needs
- Repair matters more than perfection — when you lose it, come back and reconnect

**BratBusters / Lisa Bunnage:**
- Calm leadership parenting — be the steady leader, not the reactor
- Respect to get respect — treat children as individuals with their own thoughts and feelings
- Connection over control — discipline is a small component; communication and relationship are primary
- Behavior is predictable, not personal — normalize challenges rather than catastrophizing
- Practical tools (e.g., behavior boards) for consistency

**Shared themes across both coaches:**
- Lead with calm, not frustration
- Validate the child's experience before redirecting
- Behavior is communication — look for what's underneath
- The relationship is the foundation of all discipline

### How Iji should use these

When a parent asks a parenting question:
1. **Identify the child** — if mentioned, pull their education profile (diagnoses, accommodations, strengths, challenges)
2. **Pull relevant documents** — search for neuropsych reports, teacher notes, or report cards that provide context (only for Logan and Ryker who have neuropsych evaluations; Hazel does not)
3. **Ground the advice** in Good Inside and/or BratBusters principles — reference the framework naturally, not robotically
4. **Tailor to the child** — if a child has ADHD, executive function challenges, dyslexia, etc., weave that into the coaching advice
5. **Use web search** if the question is specific enough that the embedded principles aren't sufficient (e.g., "What does Dr. Becky say about screen time limits?")
6. **Store family parenting notes** — if a parent shares what worked ("We tried the two-things-are-true approach with Ryker and it really helped"), store it in knowledge base for future reference

## Implementation notes

### 1. Create capability prompt: `config/prompts/capabilities/parenting.md`

Before the `---` separator: user-facing description of what Iji can do (parenting advice grounded in Good Inside and BratBusters, tailored to each child's profile).

After the `---` separator: system guidelines containing:
- The coaching frameworks summarized above (embedded directly — this is Iji's "training")
- Instructions to use `education_profile` for child context when a specific child is mentioned
- Instructions to use `education_documents` to search for neuropsych reports and teacher notes for additional context
- Instructions to use `web_search` as fallback for specific coaching questions
- Instructions to use `knowledge_store` when a parent shares what worked/didn't work
- Sensitivity guidance: frame challenges alongside strengths, never be judgmental, acknowledge that parenting is hard
- Tone: warm, supportive, practical — like a knowledgeable friend, not a lecture

### 2. Register the capability in `src/brain/prompt.js`

Add to `capabilityFiles` (line ~29):
```javascript
parenting: 'parenting.md',
```

**Do NOT add to `CAPABILITY_TRIGGERS`.** Instead, add `parenting` to a new `ALWAYS_ON_CAPABILITIES` array (create it near line 46):
```javascript
const ALWAYS_ON_CAPABILITIES = ['parenting'];
```

Then modify `getCapabilitiesForMessage()` to always include these:
```javascript
function getCapabilitiesForMessage(userMessage) {
  const text = (userMessage || '').trim();
  const matches = Object.entries(CAPABILITY_TRIGGERS)
    .filter(([, trigger]) => trigger.test(text))
    .map(([name]) => name);

  const base = matches.length > 0 ? matches : Object.keys(capabilityFiles);
  // Always include always-on capabilities
  for (const cap of ALWAYS_ON_CAPABILITIES) {
    if (!base.includes(cap)) base.push(cap);
  }
  return base;
}
```

This ensures parenting context is in every prompt regardless of what other triggers fire. Parenting questions are too varied for keyword matching — Iji should use natural language understanding to recognize them.

### 3. No new tools needed

This capability composes existing tools (`education_profile`, `education_documents`, `web_search`, `knowledge_store`, `knowledge_search`). No new tool code required.

### 4. No new permissions needed

Parenting advice uses the `education` permission (for child profiles/documents) and `web_search` permission (for real-time lookups). Adults already have both.

## Server requirements

None — prompt-only change deployed via git.

## Verification

- Ask Iji: "Ryker had a total meltdown after school today. He was throwing things and screaming. How should I handle it?" → Iji pulls Ryker's profile, references Good Inside (validate feelings, sturdy leadership), tailors advice to Ryker's specific situation
- Ask Iji: "Logan won't do his homework and just shuts down when I ask" → Iji pulls Logan's profile (ADHD, executive function challenges from neuropsych), references both coaches, suggests specific strategies that account for his diagnoses
- Ask Iji: "What does Dr. Becky say about sibling rivalry?" → Iji uses embedded knowledge first, falls back to web search if needed
- Ask Iji: "Hazel keeps biting at preschool" → Iji gives age-appropriate advice (Pre-K), notes no neuropsych data available for Hazel, references BratBusters' calm leadership approach
- Ask Iji: "We tried the 'two things are true' approach with Ryker last night and it really helped calm him down" → Iji stores this in knowledge base for future reference

## Done when

- [ ] `config/prompts/capabilities/parenting.md` exists with coaching frameworks and tool-use guidelines
- [ ] `parenting` registered in `capabilityFiles` in `src/brain/prompt.js`
- [ ] `parenting` added to `ALWAYS_ON_CAPABILITIES` (no trigger regex — always included)
- [ ] Guidelines instruct Iji to pull child profiles and documents for context
- [ ] Guidelines instruct Iji to use web search for specific coaching questions
- [ ] Guidelines instruct Iji to store family parenting notes in knowledge base
- [ ] Tests pass (`npm test`)
- [ ] Committed

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Parenting Methods for Iji to reference" "In Review"
```

## Commit message

`feat: add parenting capability with Good Inside and BratBusters coaching frameworks`
