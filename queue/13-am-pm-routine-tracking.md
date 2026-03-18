# AM/PM routine tracking

**Sphere:** Children
**Backlog item:** AM/PM routine tracking
**Depends on:** Task Tracker hardware (ESP32 buttons), ha_query tool

## What to build

Let adults ask Iji whether kids have completed their morning and evening routines (teeth, laundry, plates, pills). Iji queries the Task Tracker EC2 server for current routine state and reports which tasks are done and which are outstanding for each child.

## Context

The Task Tracker runs on EC2 at 34.208.73.189:8765 with a `/state` endpoint that returns JSON with each child's task completion status. See ~/task-tracker/ for the server code. Iji already has HTTP fetch patterns in the HA tools (src/tools/ha-query.js).

## Implementation notes

Create `src/tools/routine-query.js` that fetches `http://34.208.73.189:8765/state` and returns structured status per child. Tool name: `routine_query`. Add `TASK_TRACKER_URL` env var. Register in index.js, add to permissions (all adults + children for own data). Add capability prompt with trigger keywords (routine, chores, teeth, laundry, plates, pills).

## Server requirements

- [ ] `TASK_TRACKER_URL=http://34.208.73.189:8765` added to EC2 `.env`
- [ ] Env var added to `.env.example`

## Verification

- Ask Iji: "Have the kids done their chores today?" → Returns per-child task completion status
- Ask Iji: "Did Ryker brush his teeth?" → Returns Ryker's teeth task status
- Ask Iji: "What's left on Logan's routine?" → Returns Logan's incomplete tasks

## Done when

- [ ] `routine_query` tool fetches Task Tracker state and returns structured results
- [ ] Registered in tool index with permissions for all household members
- [ ] Capability prompt and trigger keywords added
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "AM/PM routine tracking" "In Review"
```

## Commit message

`feat: add routine query tool for kids' daily chore tracking`
