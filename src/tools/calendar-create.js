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

/** Normalize attendees input to array of { email, optional?, displayName? }. */
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

/** Parse reminders: array of { method: 'email'|'popup', minutes: number }. */
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

/** Parse recurrence: array of RRULE strings. */
function parseRecurrence(input) {
  if (input == null) return undefined;
  if (Array.isArray(input) && input.length === 0) return undefined;
  if (!Array.isArray(input)) return undefined;
  const rules = input.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
  return rules.length ? rules : undefined;
}

export const definition = {
  name: 'calendar_create',
  description:
    'Create an event on a household member\'s Google Calendar. Use for "add plumber Wednesday 2-4pm", "block dinner at 7 on Friday", "schedule weekly team sync", or "create a meeting with Steve and Kelly and add a Meet link". Supports: title, date/time, location, description, attendees (with optional invite emails), recurrence (e.g. weekly), Google Meet link, reminders, visibility, and transparency (busy/free). You can only create on your own calendar unless you have calendar_all.',
  input_schema: {
    type: 'object',
    properties: {
      calendar: {
        type: 'string',
        description: 'Whose calendar to add the event to (member id, e.g. "lee", "steve").',
      },
      summary: {
        type: 'string',
        description: 'Event title/summary.',
      },
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format, or "today" / "tomorrow".',
      },
      start_time: {
        type: 'string',
        description: 'Start time (e.g. "14:00" or "2:00 PM").',
      },
      end_time: {
        type: 'string',
        description: 'End time (e.g. "16:00" or "4:00 PM").',
      },
      location: {
        type: 'string',
        description: 'Optional location for the event.',
      },
      description: {
        type: 'string',
        description: 'Optional event description.',
      },
      attendees: {
        type: 'array',
        description:
          'Optional list of attendees. Each item can be an email string or { email, optional?, displayName? }. Invite emails are sent unless send_invites is false.',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                email: { type: 'string' },
                optional: { type: 'boolean' },
                displayName: { type: 'string' },
              },
              required: ['email'],
            },
          ],
        },
      },
      send_invites: {
        type: 'boolean',
        description:
          'Whether to send calendar invite emails to attendees. Default true when attendees are present.',
      },
      recurrence: {
        type: 'array',
        description:
          'Optional recurrence rules (RRULE). E.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"] for every Mon/Wed, or ["RRULE:FREQ=DAILY;COUNT=5"] for 5 days.',
        items: { type: 'string' },
      },
      add_google_meet: {
        type: 'boolean',
        description: 'If true, add a Google Meet video conference link to the event.',
      },
      reminders: {
        type: 'array',
        description:
          'Optional reminder overrides. E.g. [{ method: "email", minutes: 30 }, { method: "popup", minutes: 10 }]. method is "email" or "popup".',
        items: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['email', 'popup'] },
            minutes: { type: 'number' },
          },
        },
      },
      color_id: {
        type: 'string',
        description: 'Optional calendar color id (1–11 for standard palette).',
      },
      visibility: {
        type: 'string',
        enum: ['default', 'public', 'private', 'confidential'],
        description: 'Event visibility. default, public, private, or confidential.',
      },
      transparency: {
        type: 'string',
        enum: ['opaque', 'transparent'],
        description: '"opaque" (default) = busy, "transparent" = free (show as available).',
      },
    },
    required: ['calendar', 'summary', 'date', 'start_time', 'end_time'],
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
      error: `Permission denied: ${envelope.person} cannot create events on ${requestedCalendar}'s calendar.`,
    };
  }

  const calendarId = CALENDAR_IDS[requestedCalendar];
  if (!calendarId) {
    const household = getHousehold();
    const member = household.members[requestedCalendar];
    const name = member?.display_name ?? requestedCalendar;
    return { error: `No calendar connected for ${name} yet.` };
  }

  const day = resolveDate(input.date);
  const dateStr = day.toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T${(input.start_time || '').trim()}`);
  const end = new Date(`${dateStr}T${(input.end_time || '').trim()}`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: 'Invalid date or time format. Use YYYY-MM-DD and HH:MM.' };
  }

  const body = {
    summary: (input.summary && input.summary.trim()) || 'Event',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  if (input.location?.trim()) body.location = input.location.trim();
  if (input.description?.trim()) body.description = input.description.trim();

  const attendees = parseAttendees(input.attendees);
  if (attendees?.length) body.attendees = attendees;

  const recurrence = parseRecurrence(input.recurrence);
  if (recurrence?.length) body.recurrence = recurrence;

  const reminders = parseReminders(input.reminders);
  if (reminders) body.reminders = reminders;

  if (input.color_id != null && String(input.color_id).trim()) {
    body.colorId = String(input.color_id).trim();
  }
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

  const sendUpdates =
    attendees?.length && input.send_invites !== false ? 'all' : 'none';

  try {
    const insertParams = {
      calendarId,
      requestBody: body,
      sendUpdates,
    };
    if (body.conferenceData) insertParams.conferenceDataVersion = 1;

    const res = await client.events.insert(insertParams);
    const household = getHousehold();
    const member = household.members[requestedCalendar];
    const name = member?.display_name ?? requestedCalendar;
    log.info('calendar_create', { calendar: requestedCalendar, summary: body.summary });
    const out = {
      created: true,
      event_id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime,
      end: res.data.end?.dateTime,
      message: `Added "${body.summary}" to ${name}'s calendar.`,
    };
    if (res.data.hangoutLink) out.hangout_link = res.data.hangoutLink;
    if (res.data.conferenceData?.entryPoints?.length) {
      const meet = res.data.conferenceData.entryPoints.find((e) => e.entryPointType === 'video');
      if (meet?.uri) out.hangout_link = meet.uri;
    }
    return out;
  } catch (err) {
    if (isReadOnlyCalendarError(err)) {
      const household = getHousehold();
      const member = household.members[requestedCalendar];
      const name = member?.display_name ?? requestedCalendar;
      return {
        error: `${name}'s calendar is read-only. They can grant Iji edit access in their Google Calendar sharing settings.`,
      };
    }
    log.error('Calendar create failed', { error: err.message });
    return { error: `Calendar create failed: ${err.message}` };
  }
}
