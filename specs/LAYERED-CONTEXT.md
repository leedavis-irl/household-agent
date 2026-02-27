# Spec: Layered Context Architecture for Iji

**Purpose:** Replace Iji's current monolithic system prompt with a layered, task-scoped context system that loads only the context relevant to the current interaction. Reduces per-call token cost, improves response quality by eliminating irrelevant context, and creates a foundation for the prompt optimization loop (see `specs/PROMPT-OPTIMIZATION.md`).

**Status:** Design spec. Implementation requires changes to `src/brain/prompt.js`.
**Decision record:** `docs/decisions/2026-02-25-layered-context.md`

---

## Current State

Today, every Claude API call in Iji loads the same `config/system-prompt.md` regardless of whether the user is asking about the weather, controlling lights, or managing calendars. The prompt includes HA control instructions even when the user asks "what's for dinner?" and calendar instructions even when they say "turn off the kitchen lights."

This is the "pink elephant problem" from the AGENTS.md research: everything in context competes for attention, and irrelevant instructions bias the model toward wrong patterns.

## Target Architecture

### Layer 1: Core Identity (always loaded, ~200 tokens)

The absolute minimum for every interaction. Who Iji is, who's talking, what permissions they have, response style.

**File:** `config/prompts/core.md`

```markdown
You are Iji, the household AI assistant for a polyamorous family in Berkeley.
You are the household's chief of staff — dependable, warm, concise.

You are speaking with {{person_name}} ({{person_role}}).
Their permissions: {{permissions_description}}

Keep responses concise. This is messaging, not email.
Use tools to find information rather than guessing.
If you don't have a tool for something, say so.

{{group_behavior}}
```

### Layer 2: Capability Contexts (loaded on demand, ~100-300 tokens each)

Each capability domain gets its own context file. The brain loads only the ones relevant to the available tools AND the detected intent of the message.

**Directory:** `config/prompts/capabilities/`

| File | Loaded when | Contains |
|------|-------------|----------|
| `home-assistant.md` | Message mentions lights, temperature, devices, rooms, "who's home" | HA area-based query patterns, Hue group preference, domain+area filtering |
| `calendar.md` | Message mentions scheduling, events, times, availability | Pacific time rule, "assume future dates" rule, freebusy patterns |
| `knowledge.md` | Message contains household logistics, facts, plans | Store-vs-search guidance, expiry semantics |
| `weather.md` | Message mentions weather, temperature, rain, outfit | NWS-specific notes |
| `finance.md` | Message mentions money, transactions, spending, budget | Monarch-specific context, permission requirements |
| `email.md` | Message mentions email, inbox, messages from X | OAuth scope notes, per-user token setup |
| `messaging.md` | Message asks to send/relay a message to someone | Signal group registry, delivery confirmation behavior |
| `reminders.md` | Message asks to be reminded about something | (future — when reminder tools exist) |

### Layer 3: Situational Context (loaded based on state, ~50-100 tokens)

Contextual overlays that depend on time of day, household state, or conversation history.

| Context | Loaded when | Contains |
|---------|-------------|----------|
| `morning-briefing.md` | First message of the day from a subscribed adult | Briefing composition instructions |
| `new-user.md` | Person has fewer than 5 prior conversations | Introduction guidance, capability overview |
| `error-recovery.md` | Previous tool call in this conversation returned an error | Retry/fallback guidance |

---

## Implementation Plan

### Phase 1: Extract and Split (no behavior change)

1. Split `config/system-prompt.md` into `config/prompts/core.md` + capability files
2. Modify `src/brain/prompt.js` to concatenate them back together identically to current behavior
3. Verify: all tests pass, Signal conversations behave identically
4. This is a refactor — zero behavior change, just file reorganization

### Phase 2: Intent Detection + Selective Loading

1. Add a lightweight intent classifier to `src/brain/prompt.js`:
   - Before the main Claude call, scan the user message for keyword/pattern matches
   - Map matches to capability files to load
   - If no clear match, load all capability files (safe fallback)
   
   ```javascript
   const CAPABILITY_TRIGGERS = {
     'home-assistant': /\b(light|lamp|thermostat|temperature|lock|sensor|device|room|home|house|who.*home|turn (on|off))\b/i,
     'calendar': /\b(calendar|schedule|event|meeting|appointment|free|busy|available|book|when)\b/i,
     'knowledge': /\b(remember|forgot|know|told you|last time|dinner|plan|logistics)\b/i,
     'weather': /\b(weather|rain|cold|hot|umbrella|jacket|forecast|outside)\b/i,
     'finance': /\b(money|spend|cost|transaction|budget|pay|expense|financial)\b/i,
     'email': /\b(email|inbox|gmail|message from|mail)\b/i,
     'messaging': /\b(tell |send |message |text |relay |let .* know)\b/i,
   };
   ```

2. If no triggers match, load all capabilities (don't break on ambiguous messages)
3. Log which capabilities were loaded per call for future optimization data

### Phase 3: Measure and Iterate

1. Add token counting to the capability loading: log total prompt tokens per call, broken down by layer
2. Compare token usage before/after selective loading over 1 week
3. Review the intent detection logs: are there false negatives (needed capability not loaded)?
4. Tune triggers based on real usage data

---

## File Changes

```
config/
├── system-prompt.md              ← DELETE after migration
├── prompts/
│   ├── core.md                   ← Layer 1: always loaded
│   └── capabilities/
│       ├── home-assistant.md     ← Layer 2: on demand
│       ├── calendar.md
│       ├── knowledge.md
│       ├── weather.md
│       ├── finance.md
│       ├── email.md
│       └── messaging.md
src/brain/
├── prompt.js                     ← Modified: selective prompt assembly
```

---

## Migration Safety

- Phase 1 is a pure refactor. The concatenated prompt must be byte-identical to the current `system-prompt.md` output. Diff to verify.
- Phase 2's fallback is "load everything" — worst case is identical to current behavior.
- Phase 3 only optimizes; never removes a capability that was being loaded.

## Interaction with Prompt Optimization

The layered architecture creates a clean surface for the Arize-style prompt optimization loop (`specs/PROMPT-OPTIMIZATION.md`). Instead of optimizing one monolithic prompt, the optimizer can tune each capability file independently against task-specific evaluations. Calendar instructions get optimized against calendar tasks. HA instructions get optimized against device control tasks. Much tighter feedback signal.

## Server Requirements
- [ ] No env vars needed
- [ ] No external service changes
- [ ] Config directory structure change (new `config/prompts/` tree)
- [ ] `src/brain/prompt.js` must be updated

## Commit messages
Phase 1: `refactor(brain): split system prompt into layered capability files`
Phase 2: `feat(brain): add intent detection for selective prompt loading`
Phase 3: `feat(brain): add token counting by prompt layer`
