# Email draft

**Sphere:** Engine
**Backlog item:** Email draft
**Depends on:** email_send tool, Gmail OAuth with gmail.modify scope

## What to build

Let Iji compose and save email drafts to Gmail on behalf of household members without sending automatically. Users review the draft in Gmail before sending. Safer than direct send for important correspondence.

## Context

email_send tool exists (src/tools/email-send.js) and uses Gmail API with per-user OAuth. Draft creation uses `users.drafts.create` endpoint. The OAuth token may need `gmail.modify` scope (check if email_send already requested it). Follow the exact pattern of email-send.js.

## Implementation notes

Create `src/tools/email-draft.js` following email-send.js pattern. Tool name: `email_draft`. Parameters: to, subject, body. Uses `gmail.users.drafts.create` API. Same permission model as email_send (own account only). Return the draft ID and a link to the draft in Gmail.

## Server requirements

- [ ] Gmail OAuth token may need re-auth if `gmail.modify` scope is missing
- [ ] No new env vars needed

## Verification

- Ask Iji: "Draft an email to ryker's teacher about his IEP meeting" → Creates Gmail draft
- Check Gmail drafts folder → Draft appears with correct content
- Ask Iji: "Draft a reply to the PG&E bill notice" → Creates draft in context

## Done when

- [ ] `email_draft` tool creates Gmail drafts via API
- [ ] Returns draft ID and Gmail link
- [ ] Permission-gated same as email_send
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Email draft" "In Review"
```

## Commit message

`feat: add email draft tool for Gmail`
