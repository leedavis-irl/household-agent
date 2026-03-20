import { getDb } from '../utils/db.js';
import { getCalendarClient, getCalendarIds } from '../utils/google-calendar.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'daily_ops_check',
  description:
    "Run an on-demand daily operations check for a household member. Returns upcoming calendar events in the next 2 hours, overdue tasks, pending reminders, and recent knowledge updates. Use when someone asks 'What should I know about today?', 'What's coming up?', or 'Give me a quick status'.",
  input_schema: {
    type: 'object',
    properties: {
      person_id: {
        type: 'string',
        description: 'Optional. Whose context to check. Defaults to the person asking.',
      },
    },
  },
};

async function getUpcomingEvents(personId) {
  try {
    const client = await getCalendarClient();
    if (!client) return [];
    const calendarIds = getCalendarIds();
    const calendarId = calendarIds[personId];
    if (!calendarId) return [];

    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const res = await client.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: twoHoursFromNow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    return (res.data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary || '(no title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || null,
    }));
  } catch (err) {
    log.warn('daily_ops_check: calendar lookup failed', { person_id: personId, error: err.message });
    return [];
  }
}

function getOverdueTasks(personId) {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT id, title, due_at, priority FROM tasks
      WHERE assignee_id = ?
        AND status IN ('open', 'in_progress')
        AND due_at IS NOT NULL
        AND due_at < datetime('now')
      ORDER BY due_at ASC
      LIMIT 10
    `).all(personId);
  } catch (err) {
    log.warn('daily_ops_check: task lookup failed', { person_id: personId, error: err.message });
    return [];
  }
}

function getPendingReminders(personId) {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT id,
             COALESCE(message, content) AS message,
             fire_at,
             status
      FROM reminders
      WHERE COALESCE(target_id, target_person_id) = ?
        AND status IN ('pending', 'snoozed')
        AND fire_at <= datetime('now', '+2 hours')
      ORDER BY fire_at ASC
      LIMIT 10
    `).all(personId);
  } catch (err) {
    log.warn('daily_ops_check: reminder lookup failed', { person_id: personId, error: err.message });
    return [];
  }
}

function getRecentKnowledge() {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT id, content, reported_by, reported_at, tags
      FROM knowledge
      WHERE reported_at > datetime('now', '-24 hours')
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY reported_at DESC
      LIMIT 5
    `).all().map((r) => ({
      id: r.id,
      content: r.content,
      reported_by: r.reported_by,
      reported_at: r.reported_at,
      tags: r.tags ? JSON.parse(r.tags) : [],
    }));
  } catch (err) {
    log.warn('daily_ops_check: knowledge lookup failed', { error: err.message });
    return [];
  }
}

export async function execute(input, envelope) {
  const personId = input?.person_id || envelope.person_id;
  if (!personId) {
    return { error: 'Could not determine person to check.' };
  }

  const [upcomingEvents, overdueTasks, pendingReminders, recentKnowledge] = await Promise.all([
    getUpcomingEvents(personId),
    Promise.resolve(getOverdueTasks(personId)),
    Promise.resolve(getPendingReminders(personId)),
    Promise.resolve(getRecentKnowledge()),
  ]);

  const now = new Date().toISOString();

  return {
    checked_at: now,
    person_id: personId,
    upcoming_events: upcomingEvents,
    overdue_tasks: overdueTasks,
    reminders_due_soon: pendingReminders,
    recent_knowledge: recentKnowledge,
    summary: {
      upcoming_event_count: upcomingEvents.length,
      overdue_task_count: overdueTasks.length,
      reminder_count: pendingReminders.length,
      recent_knowledge_count: recentKnowledge.length,
    },
  };
}
