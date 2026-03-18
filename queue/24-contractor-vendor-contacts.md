# Contractor/vendor contacts

**Sphere:** Property & Home
**Backlog item:** Contractor/vendor contacts
**Depends on:** knowledge_store, knowledge_search tools

## What to build

Build a contractor and vendor contact directory — plumber, electrician, HVAC, landscaper, handyman, etc. — with name, trade, phone, email, rating, and notes from past jobs. Queryable by trade or name.

## Context

The knowledge system (src/tools/knowledge-store.js, knowledge-search.js) handles free-form facts. A structured vendor directory needs its own table for reliable querying. Follow the pattern of the team_members table in Education Advisor.

## Implementation notes

Add `vendors` table via DB migration (name, trade, phone, email, rating, notes, last_used, status). Create `src/tools/vendor-query.js` (search by trade/name) and `src/tools/vendor-store.js` (add/update vendors). Register with permissions for all adults.

## Server requirements

- [ ] DB migration runs automatically

## Verification

- Ask Iji: "Who's our plumber?" → Returns plumber contact info
- Ask Iji: "Add Mike's Electric — (510) 555-1234, great work on the panel upgrade" → Creates vendor record
- Ask Iji: "Who did we use for the last roof repair?" → Searches by trade and notes

## Done when

- [ ] `vendors` table created via migration
- [ ] `vendor_query` and `vendor_store` tools working
- [ ] Search by trade, name, and notes
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Contractor/vendor contacts" "In Review"
```

## Commit message

`feat: add contractor/vendor contact directory`
