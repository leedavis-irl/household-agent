import log from '../utils/logger.js';
import { getHousehold } from '../utils/config.js';
import { getCalendarClient, getCalendarIds, resolveDate } from '../utils/google-calendar.js';

const CALENDAR_IDS = getCalendarIds();

export const definition = {
  name: 'calendar_freebusy',
  description:
    'Find when multiple household members are all free (overlapping free time). Use for "when are Lee and Steve both free this week?" or "find a 30-minute slot for the three of us tomorrow." Returns time slots when everyone in the list is free. People without a calendar_id in household.json are noted but excluded from the check.',
  input_schema: {
    type: 'object',
    properties: {
      people: {
        type: 'array',
        items: { type: 'string' },
        description: 'Member ids to check (e.g. ["lee", "steve", "kelly"]).',
      },
      date: {
        type: 'string',
        description: 'Date to check (YYYY-MM-DD, "today", "tomorrow"). Defaults to today.',
      },
      days: {
        type: 'number',
        description: 'Number of days to look ahead from date. Default 1.',
      },
      duration_minutes: {
        type: 'number',
        description: 'Minimum length of a free block in minutes (e.g. 30 for a 30-min meeting).',
      },
    },
    required: ['people'],
  },
};

function mergeBusyIntervals(calendarsBusy) {
  const all = [];
  for (const busy of calendarsBusy) {
    for (const b of busy) all.push({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() });
  }
  if (all.length === 0) return [];
  all.sort((a, b) => a.start - b.start);
  const merged = [];
  let [curStart, curEnd] = [all[0].start, all[0].end];
  for (let i = 1; i < all.length; i++) {
    if (all[i].start <= curEnd) {
      curEnd = Math.max(curEnd, all[i].end);
    } else {
      merged.push({ start: curStart, end: curEnd });
      curStart = all[i].start;
      curEnd = all[i].end;
    }
  }
  merged.push({ start: curStart, end: curEnd });
  return merged;
}

function busyToFreeSlots(mergedBusy, timeMinMs, timeMaxMs, durationMinutes) {
  const durationMs = durationMinutes ? durationMinutes * 60 * 1000 : 0;
  const slots = [];
  let prevEnd = timeMinMs;
  for (const b of mergedBusy) {
    const start = prevEnd;
    const end = Math.min(b.start, timeMaxMs);
    if (end - start >= durationMs && end > start) {
      slots.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        duration_minutes: Math.round((end - start) / 60000),
      });
    }
    prevEnd = Math.max(prevEnd, b.end);
  }
  if (timeMaxMs - prevEnd >= durationMs) {
    slots.push({
      start: new Date(prevEnd).toISOString(),
      end: new Date(timeMaxMs).toISOString(),
      duration_minutes: Math.round((timeMaxMs - prevEnd) / 60000),
    });
  }
  return slots;
}

export async function execute(input, envelope) {
  const client = await getCalendarClient();
  if (!client) {
    return {
      error:
        'Google Calendar not configured — add config/google-service-account.json with a service account JSON.',
    };
  }

  if (!envelope.permissions.includes('calendar_household') && !envelope.permissions.includes('calendar_all')) {
    return {
      error: `Permission denied: ${envelope.person} cannot query free/busy. Requires calendar_household or calendar_all.`,
    };
  }

  const people = Array.isArray(input.people) ? input.people : [input.people].filter(Boolean);
  if (people.length === 0) return { error: 'people is required (array of member ids).' };

  const household = getHousehold();
  const calendarIds = [];
  const notes = [];

  for (const p of people) {
    const id = (typeof p === 'string' ? p : '').trim().toLowerCase();
    if (!id) continue;
    const cid = CALENDAR_IDS[id];
    if (cid) calendarIds.push(cid);
    else {
      const member = household.members[id];
      const name = member?.display_name ?? id;
      notes.push(`Can't check ${name}'s calendar — not connected yet.`);
    }
  }

  if (calendarIds.length === 0) {
    return {
      free_slots: [],
      notes,
      message: 'No calendars to check. Connect calendars in household.json.',
    };
  }

  const startDate = resolveDate(input.date || 'today');
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (input.days ?? 1));
  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();

  try {
    const res = await client.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const calendarsBusy = (res.data.calendars && Object.values(res.data.calendars))
      .map((c) => c.busy || [])
      .filter((arr) => arr.length > 0);
    const merged = mergeBusyIntervals(calendarsBusy);
    const timeMinMs = startDate.getTime();
    const timeMaxMs = endDate.getTime();
    const free_slots = busyToFreeSlots(
      merged,
      timeMinMs,
      timeMaxMs,
      input.duration_minutes ?? 0
    );

    log.info('calendar_freebusy', { people: people.length, calendars: calendarIds.length, slots: free_slots.length });
    return {
      free_slots,
      notes: notes.length ? notes : undefined,
      message:
        free_slots.length === 0
          ? 'No overlapping free time in that range.'
          : `Found ${free_slots.length} free slot(s) when everyone is available.`,
    };
  } catch (err) {
    log.error('Calendar freebusy failed', { error: err.message });
    return { error: `Calendar freebusy failed: ${err.message}` };
  }
}
