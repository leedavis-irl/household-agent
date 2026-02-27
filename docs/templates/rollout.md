# Household Rollout Template

Use this template when shipping a new Iji capability that acts on behalf of household members — especially capabilities that are visible to the outside world (sending email, sending texts) or that access personal data (reading email, calendar access).

The goal is simple: no one gets surprised by Iji doing something new on their behalf. Adults opt in when they're ready, at their own pace.

## When to use this

Use this rollout process for any capability where:
- Iji acts on behalf of a specific person (sends email as them, texts from household number on their behalf)
- Iji accesses new personal data (a new calendar, a new email account, financial data)
- The capability has an external-facing effect (messages go to people outside the household)

You do NOT need this for:
- Internal-only improvements (better briefing formatting, smarter responses)
- Capabilities that only affect Lee (she's the admin and implicit early adopter)
- Bug fixes or infrastructure changes

## Process

### 1. Build and verify with Lee

Ship the feature with Lee as the only user. Verify it works. Fix any issues. This is the normal spec → build → verify cycle.

### 2. Write the announcement

A short, plain-language Signal message that covers:
- **What's new:** one sentence on what Iji can now do
- **What it means for you:** concrete example of how you'd use it
- **What Iji WON'T do:** boundaries (e.g., "I won't send email without showing you a draft first")
- **How to opt in:** what the person needs to do (usually: "Tell me in Signal or tell Lee")
- **No pressure:** explicit "this is optional, no rush"

Keep it short. If someone wants more detail, they'll ask.

### 3. Deliver the announcement

**Where:** Iji DMs each adult individually. Not a group announcement — people should feel free to opt in (or not) without social pressure.

**When:** During reasonable hours, not buried in a busy day. Iji can use the `message_send` tool for this. Lee triggers it manually (not automated).

**Who:** All adults who don't already have the capability enabled. Currently: Steve, Kelly, Hallie, Firen.

### 4. Process opt-ins

When someone says they want it:
1. If the capability requires authorization (e.g., Gmail OAuth), walk them through the setup. This might require Lee's help on EC2.
2. Add the permission to their entry in `household.json`
3. Deploy
4. Confirm it works for them with a quick test

### 5. Log it

Add a line to `docs/rollouts/` (create the file for this capability) noting:
- Date of announcement
- Who opted in and when
- Any issues or feedback

This is lightweight — just a log, not a ceremony.

## Announcement Template

```
Hey [Name]! Iji update — I can now [capability in plain language].

For example, you could say "[concrete example]" and I'd [what happens].

A few things to know:
- [Key boundary or safety behavior]
- [Anything they need to do to set it up]
- This is totally optional — just let me know if you'd like to try it

No rush at all. Happy to answer questions if you're curious!
```

## Example: Email Send

```
Hey Steve! Iji update — I can now send emails on your behalf from your Gmail.

For example, you could say "email my boss and let him know I'll be 10 minutes late" and I'd draft the email, show it to you, and send it after you approve.

A few things to know:
- I'll always show you the draft before sending (unless you say "just send it")
- You'd need to do a quick Google authorization (takes 2 minutes, Lee can help)
- This is totally optional — just let me know if you'd like to try it

No rush at all. Happy to answer questions if you're curious!
```

## Tracking

Keep a simple record in `docs/rollouts/YYYY-MM-DD-capability-name.md`:

```markdown
# Rollout: [Capability Name]

**Shipped:** YYYY-MM-DD
**Announced:** YYYY-MM-DD

| Person | Announced | Opted In | Setup Complete | Notes |
|--------|-----------|----------|----------------|-------|
| Lee    | —         | —        | YYYY-MM-DD     | Admin/early adopter |
| Steve  | YYYY-MM-DD | — | — | |
| Kelly  | YYYY-MM-DD | — | — | |
| Hallie | YYYY-MM-DD | — | — | |
| Firen  | YYYY-MM-DD | — | — | |
```
