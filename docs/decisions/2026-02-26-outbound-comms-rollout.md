# ADR: Outbound Communication Expansion + Household Rollout Pattern

**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Lee, Claude (Engineer)

## Context

Iji can receive and read email, and send Signal messages. But it can't send email or text non-Signal contacts. Lee wants both capabilities, starting with herself, then rolling out to other adults with their explicit opt-in.

This is also the first time we're shipping capabilities that act on behalf of a person in ways that are visible to the outside world (sending email from someone's Gmail, texting from a household number). This requires a more thoughtful rollout than "flip a permission in household.json."

## Decisions

### 1. Build for Lee first, then rollout

Email send and SMS are built and verified with Lee as the only user. Once working, we use the rollout template to announce to other adults and let them opt in. This is the pattern for all future capabilities that act on someone's behalf.

### 2. Email send via Gmail API (not SMTP)

Use the same OAuth2 infrastructure as email_search/email_read. Upgrade scope from `gmail.readonly` to include `gmail.send`. This keeps auth unified and avoids SMTP credential management.

Lee will need to re-authorize with the expanded scope. Other adults will authorize when they opt in (same `scripts/gmail-auth.js` flow, updated scope).

### 3. SMS via Twilio

New Twilio account with a dedicated number. Messages sent from Iji's number, not spoofing anyone's personal number. This is for reaching non-Signal contacts: Lisa (chef), contractors, schools.

**Why Twilio over self-hosted:** Self-hosted SMS (Android SMS gateway, GSM modem + Gammu) requires dedicated hardware — a spare Android phone with a SIM or a USB GSM modem. Lee has neither available. Twilio costs ~$1-2/month for a number plus fractions of a cent per message at household volume, requires no hardware, and has near-perfect uptime. The integration pattern (HTTP API → broker module) is identical either way, so this could be swapped to self-hosted later if circumstances change.

### 4. Household rollout template

A lightweight, reusable process for announcing new capabilities and collecting opt-in from adults. Lives in `docs/templates/rollout.md`. Not a technical system — just a pattern for what to announce, how to announce it, and how to enable it.

## Consequences

- Lee gets email send immediately after scope upgrade + re-auth
- SMS requires a Twilio account (Lee's fingers, plus a small monthly cost)
- Other adults opt in at their own pace — no surprise capability changes
- The rollout template becomes a reusable asset for every future capability
