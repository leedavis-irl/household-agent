# Chef communication automation

**Sphere:** Meals & Kitchen
**Backlog item:** Chef communication automation
**Depends on:** sms_send tool (Twilio verification must complete first)

## What to build

Automate communication with Lisa (private chef) — weekly menu confirmations, grocery list sharing, schedule changes, and special dietary requests. Iji sends SMS to Lisa on behalf of the household.

## Context

SMS send tool exists (src/tools/sms-send.js) but Twilio verification is pending. Lisa's contact info should be in config/contacts.json. The meals capability (config/prompts/capabilities/) doesn't exist yet — this is part of the Meals & Kitchen department.

## Implementation notes

Create `config/prompts/capabilities/meals.md` capability prompt. Create `src/tools/chef-message.js` that wraps sms_send with chef-specific context (Lisa's number from contacts.json, meal planning context). Add a weekly menu workflow that Iji can initiate on schedule.

## Server requirements

- [ ] Twilio toll-free number verification must complete first
- [ ] Lisa's phone number added to `config/contacts.json`

## Verification

- Ask Iji: "Send Lisa next week's menu preferences" → Composes and sends SMS to Lisa
- Ask Iji: "Tell Lisa that Firen is allergic to shellfish" → Sends dietary update via SMS
- Ask Iji: "What did we tell Lisa this week?" → Shows recent chef communications

## Done when

- [ ] `chef_message` tool sends SMS to Lisa
- [ ] Meals capability prompt created
- [ ] Contact stored in contacts.json
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Chef communication automation" "In Review"
```

## Commit message

`feat: add chef communication automation via SMS`
