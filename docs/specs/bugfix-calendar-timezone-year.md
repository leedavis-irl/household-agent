# Bugfix: Calendar timezone and year handling

## Problem

Two user-reported bugs in the calendar stack:

### Bug 1: Year defaults to past
When a user says "put my hair appointment in April" (in February 2026), Iji created the event in April **2025**. Claude chose the year and `resolveDate()` accepted it without validation.

### Bug 2: Times displayed in UTC instead of Pacific
Freebusy reported a conflict "at 4am" when the actual event was at a normal hour Pacific time. All date math in the calendar stack runs on the EC2 server which is in UTC. ISO strings go to Claude who reads them literally.

### Root cause
No timezone awareness anywhere in the calendar stack. The EC2 server runs UTC. All `new Date()` calls produce UTC. No conversion to/from `America/Los_Angeles` happens at any point.

## Changes required

### 1. `config/household.json` — add household timezone

Add a top-level `timezone` field:

```json
{
  "timezone": "America/Los_Angeles",
  "members": { ... }
}
```

### 2. `src/utils/google-calendar.js` — timezone-aware date handling

Import the household timezone from config. Update `resolveDate()`:

```js
import { getHousehold } from './config.js';

export function getHouseholdTimezone() {
  return getHousehold().timezone || 'America/Los_Angeles';
}
```

**Replace `resolveDate(dateStr)`** with a version that:
- Accepts a date string (YYYY-MM-DD, "today", "tomorrow")
- Returns a plain date string (YYYY-MM-DD), NOT a Date object (avoids UTC drift)
- If the resolved date is in the past, bumps it forward by one year (the "assume future" fix)
- Uses the household timezone to determine what "today" means

**Add `toLocalISOString(isoString)`** — a helper that converts a UTC ISO string to a Pacific-localized human-readable string like `"2026-04-15T14:00 (Pacific)"`. Use `Intl.DateTimeFormat` or manual offset — do NOT add a dependency like `luxon` or `moment`.

**Add `localDateTimeToISO(dateStr, timeStr)`** — takes a date (YYYY-MM-DD) and time (HH:MM) in household local time and returns a proper ISO 8601 string with the correct UTC offset for that date (handles DST). This replaces the naive `new Date(${dateStr}T${timeStr})` pattern.

### 3. `src/tools/calendar-create.js` — use timezone-aware helpers

Replace:
```js
const day = resolveDate(input.date);
const dateStr = day.toISOString().slice(0, 10);
const start = new Date(`${dateStr}T${(input.start_time || '').trim()}`);
const end = new Date(`${dateStr}T${(input.end_time || '').trim()}`);
```

With:
```js
const dateStr = resolveDate(input.date); // now returns YYYY-MM-DD string
const startISO = localDateTimeToISO(dateStr, (input.start_time || '').trim());
const endISO = localDateTimeToISO(dateStr, (input.end_time || '').trim());
```

And use these ISO strings directly in the Google API body (they already accept ISO 8601 with offset).

Also update the response to include Pacific-formatted times:
```js
start: toLocalISOString(res.data.start?.dateTime),
end: toLocalISOString(res.data.end?.dateTime),
```

### 4. `src/tools/calendar-freebusy.js` — timezone-aware range and output

**Range construction:** Replace the `startDate.setHours(0,0,0,0)` pattern (which sets midnight UTC, not midnight Pacific) with proper Pacific midnight calculation using `localDateTimeToISO(dateStr, '00:00')` for timeMin and similar for timeMax.

**Output formatting:** In `busyToFreeSlots`, convert the ISO timestamps in the returned slots to Pacific time using `toLocalISOString()`. This is what Claude reads and relays to the user.

### 5. `src/tools/calendar-query.js` — same timezone treatment

Apply the same fixes to `calendar-query.js` if it has similar patterns. Check `calendar-modify.js` too. The rule: every tool that accepts dates/times from the user should interpret them as Pacific, and every tool that returns dates/times to Claude should format them as Pacific.

### 6. `config/system-prompt.md` — add date guidance

Add to the Guidelines section:

```
- When a user mentions a date without a year (e.g., "in April", "on March 5th"), always choose the NEXT upcoming occurrence of that date. If it's February 2026 and they say "April", that means April 2026, not April 2025. Never create events in the past.
- All calendar times are in Pacific time (America/Los_Angeles). When displaying times to users, use Pacific time.
```

## Constraints

- Do NOT add external date libraries (no luxon, moment, date-fns). Node.js `Intl` API and manual offset math are sufficient.
- Do NOT change the tool input schemas — Claude already sends YYYY-MM-DD and HH:MM, that interface is fine.
- The Google Calendar API accepts ISO 8601 with offset (e.g., `2026-04-15T14:00:00-07:00`), so pass that format for `start.dateTime` and `end.dateTime`.
- Existing tests should still pass. Run `npm test` after changes.

## Verification

After implementing, test these scenarios via Signal DM to Iji:

1. "Add a hair appointment April 15 at 2pm to my calendar" — should create in April 2026, at 2pm Pacific
2. "When am I free tomorrow?" — free slots should show Pacific times, not UTC
3. "Add a meeting today at 10am" — should be 10am Pacific, not 10am UTC
4. "What's on my calendar this week?" — all times should be Pacific
