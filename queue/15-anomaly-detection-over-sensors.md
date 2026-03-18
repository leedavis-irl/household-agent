# Anomaly detection over sensors

**Sphere:** Property & Home
**Backlog item:** Anomaly detection over sensors
**Depends on:** ha_query, ha_history tools

## What to build

Give Iji the ability to detect and alert on anomalous sensor readings — unexpected door openings, water leak detections, temperature spikes, or motion at unusual hours. Runs as a periodic check that queries HA sensor history and flags outliers.

## Context

ha_query and ha_history tools already exist. HA exposes binary_sensor.* (doors, motion, water) and sensor.* (temperature, humidity) entities. The morning briefing scheduler (src/utils/morning-briefing.js) shows the pattern for periodic checks.

## Implementation notes

Create `src/utils/anomaly-detector.js` that runs every 15 minutes, queries recent sensor history via HA API, and flags anomalies (door open > 30 min, water leak detected, temperature outside normal range). On detection, send a Signal DM to Lee. Store alert state in memory to avoid repeat notifications. Also create `src/tools/anomaly-query.js` so adults can ask 'anything unusual at home?'

## Server requirements

- [ ] No new env vars needed

## Verification

- Ask Iji: "Anything unusual at home?" → Returns recent anomaly check results
- Ask Iji: "Is the front door open?" → Checks door sensor state
- Simulate: if a door sensor has been open > 30 min, verify alert would trigger

## Done when

- [ ] Anomaly detector runs on a periodic schedule
- [ ] Alerts sent via Signal DM on detection
- [ ] `anomaly_query` tool lets adults check on demand
- [ ] Dedup prevents repeat alerts for same event
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Anomaly detection over sensors" "In Review"
```

## Commit message

`feat: add sensor anomaly detection with periodic checks and alerts`
