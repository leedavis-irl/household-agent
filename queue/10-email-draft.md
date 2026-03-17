# Email draft tool

**Sphere:** Engine › Communication
**Backlog item:** Draft email for review
**Depends on:** email_send (✅ Verified), Gmail send OAuth scope already in place

## What to build

`email_send` exists and works. Add `email_draft` — saves a composed email to Gmail Drafts without sending it. The user experience: "draft an email to Lisa confirming Thursday's menu" → Iji composes it and saves it to Gmail Drafts, confirms with a preview. User reviews and sends from Gmail themselves.

## Read first

- `specs/EMAIL-SEND.md` — the full send spec, email_draft is explicitly called out as the natural follow-on
- `src/tools/email-send.js` — follow this pattern exactly, same OAuth flow, same permission model
- `src/utils/google-oauth.js` — OAuth client, needs `gmail.compose` or `gmail.modify` scope for drafts
- `src/tools/email-search.js` — additional pattern reference

## Done when

- [ ] `email_draft` tool saves a composed email to Gmail Drafts (does not send)
- [ ] Returns a confirmation with subject, recipient, and a short preview of the body
- [ ] OAuth scope updated to include draft creation if not already covered by `gmail.send`
- [ ] Tool registered in `src/tools/index.js`
- [ ] Permission added in `src/utils/permissions.js` (same as `email_send`)
- [ ] `npm test` passes
- [ ] Feature branch opened, PR against main

## Verify

Via CLI: "draft an email to leedavis.irl@gmail.com with subject 'test draft' saying hello" → confirm a draft appears in Lee's Gmail Drafts folder.

## Server requirements

- [ ] Check if `gmail.modify` scope needs to be added to OAuth — if so, Lee must re-run `node scripts/gmail-auth.js lee` after deploy
- [ ] No new env vars

## Commit message

`feat: email_draft tool — save composed emails to Gmail Drafts without sending`
