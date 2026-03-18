# Guest list and visitor profiles

**Sphere:** People & Relationships
**Backlog item:** Guest list and visitor profiles
**Depends on:** knowledge_store, knowledge_search tools

## What to build

Maintain a directory of frequent visitors and guests — names, relationship to household, dietary preferences, room preferences, kids' friends' parent contacts. Queryable by Iji when planning events or preparing for guests.

## Context

Knowledge store handles free-form facts but a structured guest directory is more useful for reliable queries. Follow the vendor contacts pattern (structured table + query/store tools).

## Implementation notes

Add `guests` table via DB migration (name, relationship, dietary_preferences, room_preference, kids_connection, phone, email, notes, last_visit). Create `src/tools/guest-query.js` and `src/tools/guest-store.js`. Register with permissions for all adults.

## Server requirements

- [ ] DB migration runs automatically

## Verification

- Ask Iji: "Add Sarah Chen as a frequent guest — she's Ryker's friend's mom, vegetarian, prefers the blue room" → Creates guest record
- Ask Iji: "Sarah is coming this weekend, any dietary notes?" → Returns vegetarian preference
- Ask Iji: "Who has visited recently?" → Lists guests by last_visit

## Done when

- [ ] `guests` table created via migration
- [ ] `guest_query` and `guest_store` tools working
- [ ] Search by name, relationship, dietary needs
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Guest list and visitor profiles" "In Review"
```

## Commit message

`feat: add guest and visitor profile directory`
