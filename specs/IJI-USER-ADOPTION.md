# Spec: Iji User Adoption Metrics

**Status:** Draft
**Backlog bucket:** Communication & Correspondence
**Depends on:** Morning Briefings v1 (✅ Verified), Usage Logging (✅ exists)

## Problem

Iji is only useful if people actually use her. Right now there's no visibility into whether household members are engaging with Iji regularly or drifting away. Lee wants a simple weekly signal (literally — via Signal) that surfaces adoption health so he can nudge people or adjust capabilities before Iji becomes irrelevant to part of the family.

## Design Decision: Weekly Signal digest, not a dashboard

Lee explicitly asked for a simple metric delivered via Signal weekly — no dashboard, no over-engineering. The data already exists in `conversation_evals` and `claude_usage` tables. We just need a scheduled query + formatted delivery.

Why this approach:
- All interaction data is already captured in SQLite (`conversation_evals`, `claude_usage`)
- The morning briefing scheduler is a proven pattern for scheduled Signal delivery
- A weekly digest keeps it lightweight — one message, one glance, done

## Metrics

The weekly adoption report surfaces these metrics per household member:

### Per-Person (adults + children who have interacted)

| Metric | Source | Why it matters |
|--------|--------|----------------|
| **Message count** (this week) | `conversation_evals` rows | Basic engagement signal |
| **Trend** (↑ ↓ →) vs prior week | Compare two weeks of `conversation_evals` | Are people using Iji more or less? |
| **Last interaction** | Most recent `created_at` in `conversation_evals` | Spot someone who's gone silent |
| **Top capabilities used** | `capabilities_loaded` column in `conversation_evals` | What's actually valuable to each person |

### Household-Level

| Metric | Source | Why it matters |
|--------|--------|----------------|
| **Total conversations** (this week) | `conversation_evals` count | Overall activity pulse |
| **Active members** (this week vs last) | Distinct `person_id` in `conversation_evals` | Is adoption growing or shrinking? |
| **Busiest day** | Group by date | When does the household lean on Iji most? |
| **Weekly cost** | `claude_usage` sum of `estimated_cost_usd` | Keep an eye on spend alongside adoption |

### Adoption Health Flag

A simple one-line summary at the top:

- **Healthy** — all adults interacted this week
- **Drifting** — 1-2 adults had zero interactions this week
- **At risk** — 3+ adults had zero interactions, or total conversations dropped >50% vs prior week

## Delivery

### Schedule

- **When:** Every Sunday at 10:00 AM Pacific
- **To:** Lee only (admin)
- **Channel:** Signal DM
- **Deduplication:** Same pattern as morning briefing — in-memory `Set` keyed by `adoption-${dateKey}`

### Message Format

```
📊 Iji Adoption — Week of Mar 9

Status: Healthy ✓

Household: 47 conversations (↑12% vs last week)
Active members: 5/5 adults
Busiest day: Tuesday (14 conversations)
Weekly cost: $1.23

Lee        — 18 msgs (↑)  · calendar, hue, knowledge
Kelly      —  9 msgs (→)  · calendar, reminders
Steve      —  8 msgs (↑)  · weather, knowledge
Hallie     —  7 msgs (↓)  · reminders, hue
Firen      —  5 msgs (→)  · calendar, knowledge

Last heard from everyone within 2 days.
```

If someone hasn't interacted:
```
⚠️ Hallie — no interactions in 12 days
```

## Implementation

### New utility: `src/utils/adoption-metrics.js`

Queries SQLite and computes all metrics. Pure data — no Signal sending.

```
export function getWeeklyAdoptionReport(weekEndDate)
```

**Returns:**
```js
{
  weekLabel: 'Mar 9',
  status: 'healthy' | 'drifting' | 'at-risk',
  household: {
    totalConversations: 47,
    priorWeekConversations: 42,
    trendPct: 12,
    activeMembers: 5,
    totalAdults: 5,
    busiestDay: 'Tuesday',
    busiestDayCount: 14,
    weeklyCost: 1.23
  },
  members: [
    {
      personId: 'lee',
      name: 'Lee',
      messageCount: 18,
      priorWeekCount: 14,
      trend: 'up',       // 'up' | 'down' | 'flat'
      lastInteraction: '2026-03-14T...',
      daysSinceLastInteraction: 0,
      topCapabilities: ['calendar', 'hue', 'knowledge']
    },
    // ...
  ]
}
```

**Queries:**
- Current week: `SELECT * FROM conversation_evals WHERE created_at >= ? AND created_at < ?` (Sunday-to-Sunday window)
- Prior week: same query shifted back 7 days
- Cost: `SELECT SUM(estimated_cost_usd) FROM claude_usage WHERE timestamp >= ? AND timestamp < ?`
- Top capabilities: Parse `capabilities_loaded` column, count occurrences per person, take top 3

**Trend logic:**
- `up`: this week > prior week × 1.1
- `down`: this week < prior week × 0.9
- `flat`: within ±10%

**Health status logic:**
- Count adults with zero `conversation_evals` rows this week
- 0 inactive → `healthy`
- 1-2 inactive → `drifting`
- 3+ inactive OR total conversations dropped >50% → `at-risk`

### New utility: `src/utils/adoption-formatter.js`

Formats the report object into a readable Signal message string.

```
export function formatAdoptionReport(report)
```

Takes the object from `getWeeklyAdoptionReport()` and returns the formatted string shown in the Message Format section above.

### New scheduler: `src/scheduler/adoption-report.js`

Follows the morning briefing pattern — polling interval, deduplication, Signal delivery.

```
export function startAdoptionReportScheduler()
```

**Behavior:**
- Polls every 60 seconds (same as morning briefing)
- On Sundays at hour >= 10 Pacific, if not already sent this week:
  - Calls `getWeeklyAdoptionReport()` for the prior 7-day window
  - Formats via `formatAdoptionReport()`
  - Sends to Lee's Signal number via `sendMessage()`
  - Marks as sent in deduplication Set

**Deduplication key:** `adoption-${isoWeekString}` in an in-memory `Set`

## Files to Create

| File | Description |
|------|-------------|
| `src/utils/adoption-metrics.js` | Query + compute adoption metrics from SQLite |
| `src/utils/adoption-formatter.js` | Format report object → Signal message string |
| `src/scheduler/adoption-report.js` | Weekly scheduler — poll, dedupe, deliver via Signal |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/index.js` | Modify | Import and call `startAdoptionReportScheduler()` alongside other schedulers |

## Server Requirements

- [ ] No new env vars
- [ ] No new external service accounts
- [ ] No new npm packages
- [ ] No new database tables (queries existing `conversation_evals` and `claude_usage`)
- [ ] No config/household.json changes (Lee-only, hardcoded recipient)

## Do NOT Change

- `conversation_evals` or `claude_usage` table schemas
- Morning briefing scheduler logic
- Signal broker (`src/broker/signal.js`)
- Any existing tool definitions or permissions

## Commit Message

```
feat: weekly Iji adoption report — user engagement metrics via Signal

- Query conversation_evals + claude_usage for per-person weekly metrics
- Health status flag (healthy / drifting / at-risk)
- Sunday 10am Pacific delivery to Lee via Signal
- Follows morning briefing scheduler pattern
```
