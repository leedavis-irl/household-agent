import log from '../utils/logger.js';
import { getHousehold } from '../utils/config.js';
import {
  getCalendarClient,
  getCalendarIds,
  resolveDate,
  isReadOnlyCalendarError,
} from '../utils/google-calendar.js';

const CALENDAR_IDS = getCalendarIds();

function checkCalendarWritePermission(requestedCalendar, envelope) {
  const personId = envelope.person_id?.toLowerCase() ?? '';
  if (requestedCalendar === personId) {
    return envelope.permissions.includes('calendar_own') || envelope.permissions.includes('calendar_all');
  }
  return envelope.permissions.includes('calendar_all');
}

function parseAttendees(input) {
  if (input == null) return undefined;
  if (Array.isArray(input) && input.length === 0) return undefined;
  if (!Array.isArray(input)) return undefined;
  const out = [];
  for (const a of input) {
    if (typeof a === 'string' && a.trim()) {
      out.push({ email: a.trim() });
    } else if (a && typeof a === 'object' && a.email) {
      out.push({
        email: String(a.email).trim(),
        optional: Boolean(a.optional),
        displayName: a.displayName ? String(a.displayName).trim() : undefined,
      });
    }
  }
  return out.length ? out : undefined;
}

function parseReminders(input) {
  if (input == null) return undefined;
  if (Array.isArray(input) && input.length === 0) return undefined;
  if (!Array.isArray(input)) return undefined;
  const overrides = [];
  for (const r of input) {
    const method = (r.method || 'popup').toLowerCase();
    const minutes = typeof r.minutes === 'number' ? r.minutes : parseInt(r.minutes, 10);
    if (method && (method === 'email' || method === 'popup') && Number.isFinite(minutes)) {
      overrides.push({ method, minutes });
    }
  }
  return overrides.length ? { useDefault: false, overrides } : undefined;
}

function parseRecurrence(input) {
  if (input == null) return undefined;
  if (Array.isArray(input) && input.length === 0) return undefined;
  if (!Array.isArray(input)) return undefined;
  const rules = input.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
  return rules.length ? rules : undefined;
}

export const definition = {
  name: 'calendar_modify',
  description:
    'Reschedule, update, or cancel an event on a household member\'s Google Calendar. Identify the event by event_id (from a previous query or create) or by event_summary and optional date range. Actions: reschedule (change time/date), update (change summary, location, description, attendees, recurrence, reminders, Meet link, visibility, transparency), cancel (delete). When updating, you can set any subset of fields; invite emails are sent to (new) attendees unless send_invites is false.',
  input_schema: {
    type: 'object',
    properties: {
      calendar: {
        type: 'string',
        description: 'Whose calendar the event is on (member id, e.g. "lee", "steve").',
      },
      event_id: {
        type: 'string',
        description: 'Google Calendar event ID (if known from a previous query or create).',
      },
      event_summary: {
        type: 'string',
        description: 'Event title to search for (used with date/days if event_id not provided).',
      },
      date: {
        type: 'string',
        description: 'Date to search (YYYY-MM-DD, "today", "tomorrow"). Required when using event_summary.',
      },
      days: {
        type: 'number',
        description: 'Number of days to search from date when using event_summary. Default 1.',
      },
      action: {
        type: 'string',
        enum: ['reschedule', 'update', 'cancel'],
        description: 'What to do: reschedule (change time), update (change details), cancel (delete).',
      },
      new_date: {
        type: 'string',
        description: 'For reschedule: new date (YYYY-MM-DD or today/tomorrow).',
      },
      new_start_time: {
        type: 'string',
        description: 'For reschedule: new start time (e.g. "14:00").',
      },
      new_end_time: {
        type: 'string',
        description: 'For reschedule: new end time (e.g. "16:00").',
      },
      summary: {
        type: 'string',
        description: 'For update: new event title.',
      },
      location: {
        type: 'string',
        description: 'For update: new location.',
      },
      description: {
        type: 'string',
        description: 'For update: new description.',
      },
      attendees: {
        type: 'array',
        description:
          'For update: replace attendees. Each item: email string or { email, optional?, displayName? }. Sends invites unless send_invites is false.',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: { email: { type: 'string' }, optional: { type: 'boolean' }, displayName: { type: 'string' } },
              required: ['email'],
            },
          ],
        },
      },
      send_invites: {
        type: 'boolean',
        description: 'For update with attendees: whether to send invite emails. Default true.',
      },
      recurrence: {
        type: 'array',
        description: 'For update: recurrence rules (RRULE strings). Set to empty array to remove recurrence.',
        items: { type: 'string' },
      },
      add_google_meet: {
        type: 'boolean',
        description: 'For update: if true, add a Google Meet link (if event does not already have one).',
      },
      reminders: {
        type: 'array',
        description: 'For update: reminder overrides. E.g. [{ method: "email", minutes: 30 }, { method: "popup", minutes: 10 }].',
        items: {
          type: 'object',
          properties: { method: { type: 'string', enum: ['email', 'popup'] }, minutes: { type: 'number' } },
        },
      },
      color_id: {
        type: 'string',
        description: 'For update: calendar color id.',
      },
      visibility: {
        type: 'string',
        enum: ['default', 'public', 'private', 'confidential'],
        description: 'For update: event visibility.',
      },
      transparency: {
        type: 'string',
        enum: ['opaque', 'transparent'],
        description: 'For update: opaque (busy) or transparent (free).',
      },
    },
    required: ['calendar', 'action'],
  },
};

export async function execute(input, envelope) {
  const client = await getCalendarClient();
  if (!client) {
    return {
      error:
        'Google Calendar not configured — add config/google-service-account.json with a service account JSON.',
    };
  }

  const requestedCalendar = (input.calendar || '').trim().toLowerCase();
  if (!requestedCalendar) return { error: 'calendar is required.' };

  if (!checkCalendarWritePermission(requestedCalendar, envelope)) {
    return {
      error: `Permission denied: ${envelope.person} cannot modify events on ${requestedCalendar}'s calendar.`,
    };
  }

  const calendarId = CALENDAR_IDS[requestedCalendar];
  if (!calendarId) {
    const household = getHousehold();
    const member = household.members[requestedCalendar];
    const name = member?.display_name ?? requestedCalendar;
    return { error: `No calendar connected for ${name} yet.` };
  }

  let eventId = input.event_id?.trim();
  if (!eventId && input.event_summary) {
    const startDate = resolveDate(input.date || 'today');
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (input.days ?? 7));
    const res = await client.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });
    const summaryLower = input.event_summary.trim().toLowerCase();
    const match = (res.data.items || []).find(
      (e) => e.summary && e.summary.toLowerCase().includes(summaryLower)
    );
    if (!match) {
      return {
        error: `No event matching "${input.event_summary}" found in that date range. Try a broader range or use event_id.`,
      };
    }
    eventId = match.id;
  }

  if (!eventId) {
    return { error: 'Provide either event_id or event_summary (and date/days) to identify the event.' };
  }

  const action = (input.action || '').toLowerCase();

  try {
    if (action === 'cancel') {
      await client.events.delete({ calendarId, eventId });
      log.info('calendar_modify: cancel', { calendar: requestedCalendar, eventId });
      return { cancelled: true, message: 'Event cancelled.' };
    }

    if (action === 'reschedule') {
      const day = resolveDate(input.new_date || 'today');
      const dateStr = day.toISOString().slice(0, 10);
      const start = new Date(`${dateStr}T${(input.new_start_time || '').trim()}`);
      const end = new Date(`${dateStr}T${(input.new_end_time || '').trim()}`);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { error: 'reschedule requires new_date, new_start_time, and new_end_time.' };
      }
      const body = {
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };
      await client.events.patch({
        calendarId,
        eventId,
        requestBody: body,
      });
      log.info('calendar_modify: reschedule', { calendar: requestedCalendar, eventId });
      return { updated: true, message: 'Event rescheduled.' };
    }

    if (action === 'update') {
      const body = {};
      if (input.summary?.trim()) body.summary = input.summary.trim();
      if (input.location !== undefined) body.location = input.location?.trim() ?? '';
      if (input.description !== undefined) body.description = input.description?.trim() ?? '';

      const attendees = parseAttendees(input.attendees);
      if (attendees !== undefined) body.attendees = attendees;

      if (input.recurrence !== undefined) {
        const recurrence = parseRecurrence(input.recurrence);
        body.recurrence = recurrence ?? [];
      }

      const reminders = parseReminders(input.reminders);
      if (reminders !== undefined) body.reminders = reminders;

      if (input.color_id != null && String(input.color_id).trim()) body.colorId = String(input.color_id).trim();
      if (input.visibility && ['default', 'public', 'private', 'confidential'].includes(input.visibility)) {
        body.visibility = input.visibility;
      }
      if (input.transparency && (input.transparency === 'opaque' || input.transparency === 'transparent')) {
        body.transparency = input.transparency;
      }

      if (input.add_google_meet) {
        body.conferenceData = {
          createRequest: {
            requestId: `iji-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      if (Object.keys(body).length === 0) {
        return { error: 'update requires at least one of summary, location, description, attendees, recurrence, reminders, add_google_meet, color_id, visibility, or transparency.' };
      }

      const patchParams = {
        calendarId,
        eventId,
        requestBody: body,
      };
      if (body.conferenceData) patchParams.conferenceDataVersion = 1;
      if (body.attendees?.length && input.send_invites !== false) {
        patchParams.sendUpdates = 'all';
      }

      await client.events.patch(patchParams);
      log.info('calendar_modify: update', { calendar: requestedCalendar, eventId });
      return { updated: true, message: 'Event updated.' };
    }

    return { error: 'action must be reschedule, update, or cancel.' };
  } catch (err) {
    if (isReadOnlyCalendarError(err)) {
      const household = getHousehold();
      const member = household.members[requestedCalendar];
      const name = member?.display_name ?? requestedCalendar;
      return {
        error: `${name}'s calendar is read-only. They can grant Iji edit access in their Google Calendar sharing settings.`,
      };
    }
    log.error('Calendar modify failed', { error: err.message });
    return { error: `Calendar modify failed: ${err.message}` };
  }
}
