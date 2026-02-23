import log from '../utils/logger.js';
import { getHousehold } from '../utils/config.js';
import { getCalendarClient, getCalendarIds, resolveDate } from '../utils/google-calendar.js';

const CALENDAR_IDS = getCalendarIds();

function checkCalendarPermission(requestedCalendar, envelope) {
  const personId = envelope.person_id?.toLowerCase() ?? '';

  if (requestedCalendar === personId) {
    return (
      envelope.permissions.includes('calendar_own') ||
      envelope.permissions.includes('calendar_all')
    );
  }
  if (requestedCalendar === 'household') {
    return (
      envelope.permissions.includes('calendar_household') ||
      envelope.permissions.includes('calendar_all')
    );
  }
  return envelope.permissions.includes('calendar_all');
}

function formatEvent(e) {
  const start = e.start?.dateTime || e.start?.date;
  const end = e.end?.dateTime || e.end?.date;
  const out = {
    id: e.id,
    summary: e.summary ?? null,
    start,
    end,
    location: e.location || null,
    status: e.status || null,
  };
  if (e.description?.trim()) out.description = e.description.trim();
  if (e.recurrence?.length) out.recurrence = e.recurrence;
  if (e.hangoutLink) out.hangout_link = e.hangoutLink;
  else if (e.conferenceData?.entryPoints?.length) {
    const meet = e.conferenceData.entryPoints.find((ep) => ep.entryPointType === 'video');
    if (meet?.uri) out.hangout_link = meet.uri;
  }
  if (e.attendees?.length) {
    out.attendees = e.attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName || null,
      responseStatus: a.responseStatus || 'needsAction',
      optional: a.optional || false,
    }));
  }
  if (e.organizer?.email) out.organizer = e.organizer.email;
  if (e.visibility) out.visibility = e.visibility;
  if (e.transparency) out.transparency = e.transparency;
  return out;
}

export const definition = {
  name: 'calendar_query',
  description:
    'Check a person\'s Google Calendar for events. Returns event id, summary, start/end, location, description, recurrence, Google Meet link (if any), attendees with response status (accepted/declined/tentative/needsAction), and visibility. Use the event id for calendar_modify. Permission-gated: people can check their own calendar, adults can check the shared household calendar.',
  input_schema: {
    type: 'object',
    properties: {
      calendar: {
        type: 'string',
        description:
          'Whose calendar to check: a person\'s name (e.g., "lee", "steve") or "household" for the shared calendar. Defaults to the requesting person.',
      },
      date: {
        type: 'string',
        description:
          'Date to query in YYYY-MM-DD format. Defaults to today. Use "tomorrow" as a shorthand.',
      },
      days: {
        type: 'number',
        description: 'Number of days to look ahead from the date. Defaults to 1.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of events to return (default 20, max 100).',
      },
    },
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

  const requestedCalendar = (input.calendar || envelope.person_id || envelope.person).toLowerCase();

  if (!checkCalendarPermission(requestedCalendar, envelope)) {
    return {
      error: `Permission denied: ${envelope.person} cannot view ${requestedCalendar}'s calendar.`,
    };
  }

  const calendarId = CALENDAR_IDS[requestedCalendar];
  if (!calendarId) {
    const household = getHousehold();
    const member = household.members[requestedCalendar];
    const name = member?.display_name ?? requestedCalendar;
    return { error: `No calendar connected for ${name} yet.` };
  }

  const startDate = resolveDate(input.date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (input.days || 1));
  const maxResults = Math.min(100, Math.max(1, Number(input.max_results) || 20));

  try {
    const res = await client.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults,
    });

    const events = (res.data.items || []).map(formatEvent);

    if (events.length === 0) {
      return { results: [], message: `No events found for ${requestedCalendar}.` };
    }
    return { results: events };
  } catch (err) {
    log.error('Calendar query failed', { error: err.message });
    return { error: `Calendar query failed: ${err.message}` };
  }
}
