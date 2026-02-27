# Feature Request Intake — Verification Checklist

## Submit (any adult)

- [ ] **Signal → submit:** Any adult sends "feature request: I wish you could track packages" → Iji logs it, responds warmly, no timeline promises
- [ ] **Natural language detection:** "It would be nice if you could remind me about laundry" → Iji recognizes as feature request and logs it
- [ ] **Requester recorded:** The `requester_id` matches the person who sent the message
- [ ] **Duplicate submission:** Same person submits same idea twice → both get logged (dedup is human triage, not automated)

## List (admin only)

- [ ] **Lee asks:** "Show me pending feature requests" → Iji returns list with IDs, requester names, request text, timestamps
- [ ] **Status filter:** "Show me accepted feature requests" → only returns accepted
- [ ] **Non-admin denied:** Steve asks "show me feature requests" → tool returns admin-only error, Iji explains gracefully

## Triage (admin only)

- [ ] **Accept:** Lee says "accept feature request 3, note: good idea, adding to scheduling bucket" → status updated, triage_notes saved, triaged_at set
- [ ] **Decline with notify:** Lee says "decline request 2 and let them know" → status updated AND requester gets a Signal DM
- [ ] **Merge:** Lee says "merge request 5, it's related to the calendar work" → status set to merged
- [ ] **Non-admin denied:** Non-admin tries to triage → blocked

## Notification (via triage)

- [ ] **DM sent:** When `notify_requester: true`, requester gets a natural-sounding Signal DM about the decision
- [ ] **No DM by default:** When `notify_requester` is omitted or false, no message sent
- [ ] **Message is natural:** Notification reads like Iji talking, not a ticket system

## Morning Briefing

- [ ] **Count shown:** Lee's morning briefing includes "📋 N new feature requests to review" when there are pending requests
- [ ] **Hidden when zero:** No line when all requests are triaged
- [ ] **Non-admin excluded:** Other adults' briefings don't show the count

## Regression

- [ ] **Existing tools unaffected:** knowledge_store, reminder_set, email_send all still work
- [ ] **Database migration safe:** Service restart doesn't error — new table created alongside existing tables
- [ ] **Tool index complete:** All three new tools appear in Claude's tool list
