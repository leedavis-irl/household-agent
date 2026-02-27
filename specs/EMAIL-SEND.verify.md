# Verification: Email Send

**Spec:** `specs/EMAIL-SEND.md`

## Pre-deploy (code review)

- [ ] `email-send.js` follows same patterns as `email-search.js` (person resolution, permission check, OAuth client, error handling)
- [ ] Gmail message constructed as base64url-encoded RFC 2822 MIME
- [ ] Tool registered in `src/tools/index.js`
- [ ] Default scopes in `google-oauth.js` include both `gmail.readonly` and `gmail.send`
- [ ] Existing email_search and email_read still work (scopes are a superset)
- [ ] `email_send` permission added to Lee in `household.json`
- [ ] `email.md` capability prompt updated with send guidelines and confirmation behavior
- [ ] No hardcoded email addresses in tool code

## Post-deploy (Signal tests)

**Setup:** After deploy, SSH to EC2 and run `node scripts/gmail-auth.js lee` to re-authorize with expanded scope.

- [ ] "Email Lisa at lisa@example.com to confirm Thursday's menu" → Iji drafts and shows preview, waits for confirmation
- [ ] Confirm → email actually sends, appears in Lee's Gmail Sent folder
- [ ] "Just email Lisa at lisa@example.com and tell her dinner is at 7" → sends without preview (clear intent)
- [ ] Check sent email has correct From (Lee's Gmail), To, Subject, Body
- [ ] "Send an email to steve about the weekend" → works (internal household member, has email in config)
- [ ] Ask Steve to send email (no permission) → gets clear opt-in message
- [ ] "Search my email for Lisa" → still works (read not broken by scope change)

## Restart resilience

- [ ] Restart Iji service → email_send still works (no in-memory state)
- [ ] Re-deploy via CI/CD → email_send still works (OAuth tokens in data/ persist)

## Error paths

- [ ] Send to invalid email address → clear error, no crash
- [ ] Send with expired OAuth token → clear re-auth message
- [ ] Send without permission → clear opt-in message
- [ ] Send with empty subject or body → Iji should compose something reasonable or ask, not error
