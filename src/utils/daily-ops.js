import { getHousehold } from './config.js';
import { getDb } from './db.js';
import { sendMessage } from '../broker/signal.js';
import { think } from '../brain/index.js';
import { getCalendarClient, getCalendarIds } from './google-calendar.js';
import log from './logger.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DAILY_OPS_ENABLED = process.env.DAILY_OPS_ENABLED !== 'false';
const WAKING_HOUR_START = 7;  // 7am Pacific
const WAKING_HOUR_END = 22;   // 10pm Pacific

// In-memory dedup: sent nudge keys (personId:type:id:dateKey)
const sentToday = new Set();

// Exported for testing only
export function _resetState() {
  sentToday.clear();
}

export function getSentToday() {
  return new Set(sentToday);
}

function pacificNowParts() {
  const d = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).format(d));
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const longDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
  return { hour, dateKey, longDate };
}

export function isWakingHours(hour) {
  return hour >= WAKING_HOUR_START && hour < WAKING_HOUR_END;
}

async function getUpcomingCalendarEvents(personId) {
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

    return res.data.items || [];
  } catch (err) {
    log.warn('Daily ops: calendar check failed', { person_id: personId, error: err.message });
    return [];
  }
}

export function getOverdueTasks(personId) {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT id, title, due_at FROM tasks
      WHERE assignee_id = ?
        AND status IN ('open', 'in_progress')
        AND due_at IS NOT NULL
        AND due_at < datetime('now')
      ORDER BY due_at ASC
      LIMIT 5
    `).all(personId);
  } catch (err) {
    log.warn('Daily ops: task check failed', { person_id: personId, error: err.message });
    return [];
  }
}

async function collectActionableItems(personId, dateKey) {
  const items = [];

  // Upcoming calendar events in next 2 hours
  const events = await getUpcomingCalendarEvents(personId);
  for (const event of events) {
    const key = `${personId}:calendar:${event.id}:${dateKey}`;
    if (!sentToday.has(key)) {
      const start = event.start?.dateTime || event.start?.date || '';
      items.push({
        type: 'calendar',
        key,
        summary: event.summary || '(no title)',
        start,
        location: event.location || null,
      });
    }
  }

  // Overdue tasks
  const tasks = getOverdueTasks(personId);
  for (const task of tasks) {
    const key = `${personId}:task:${task.id}:${dateKey}`;
    if (!sentToday.has(key)) {
      items.push({ type: 'task', key, title: task.title, due_at: task.due_at });
    }
  }

  return items;
}

export async function runDailyOpsCheck() {
  const { hour, dateKey, longDate } = pacificNowParts();

  if (!isWakingHours(hour)) {
    log.debug('Daily ops: outside waking hours, skipping', { hour });
    return { skipped: true, reason: 'outside waking hours' };
  }

  let household;
  try {
    household = getHousehold();
  } catch (err) {
    log.warn('Daily ops: config not loaded', { error: err.message });
    return { skipped: true, reason: 'config not loaded' };
  }

  const results = [];

  for (const [personId, member] of Object.entries(household.members || {})) {
    if (!member?.identifiers?.signal) continue;
    if (member.role === 'child') continue;

    try {
      const items = await collectActionableItems(personId, dateKey);
      if (items.length === 0) {
        results.push({ person_id: personId, nudged: false });
        continue;
      }

      const itemDescriptions = items.map((i) => {
        if (i.type === 'calendar') return `- Upcoming event in next 2 hours: "${i.summary}" at ${i.start}${i.location ? ` (${i.location})` : ''}`;
        if (i.type === 'task') return `- Overdue task: "${i.title}"`;
        return `- ${i.type}: ${JSON.stringify(i)}`;
      }).join('\n');

      const envelope = {
        person_id: personId,
        person: member.display_name,
        role: member.role,
        permissions: member.permissions || [],
        message: `Generate a brief, actionable nudge for ${member.display_name}. Today is ${longDate}.

The following items may need their attention right now:
${itemDescriptions}

Check any relevant details needed for context (e.g. if a task is overdue, check for any related context; if an event is coming up, note key details). Send a concise Signal message — 1-3 sentences max. Focus only on what's immediately actionable. Write like a Chief of Staff giving a quick heads-up.

If after reviewing context nothing is truly urgent or actionable right now, respond with exactly: SKIP`,
        source_channel: 'signal',
        reply_address: member.identifiers.signal,
        conversation_id: `daily-ops-${personId}-${dateKey}-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

      const response = await think(envelope);

      if (!response || response.trim() === 'SKIP' || response.trim().toUpperCase().startsWith('SKIP')) {
        results.push({ person_id: personId, nudged: false, reason: 'skipped by brain' });
        continue;
      }

      const delivered = sendMessage(member.identifiers.signal, response);
      if (delivered) {
        for (const item of items) sentToday.add(item.key);
        log.info('Daily ops nudge sent', { person_id: personId, item_count: items.length });
        results.push({ person_id: personId, nudged: true, items: items.length });
      } else {
        log.error('Daily ops nudge failed: Signal unavailable', { person_id: personId });
        results.push({ person_id: personId, nudged: false, error: 'Signal unavailable' });
      }
    } catch (err) {
      log.error('Daily ops check failed for person', { person_id: personId, error: err.message });
      results.push({ person_id: personId, error: err.message });
    }
  }

  // Prune stale date keys from sentToday
  for (const key of [...sentToday]) {
    if (!key.includes(`:${dateKey}`)) sentToday.delete(key);
  }

  return { hour, date: dateKey, results };
}

/**
 * Returns ms until the next check should run:
 * - During waking hours (7am–10pm Pacific): CHECK_INTERVAL_MS (30 min)
 * - Outside waking hours: ms until next 7am Pacific
 * Exported for testing.
 */
export function getNextRunDelayMs() {
  const now = new Date();
  const { hour } = pacificNowParts();
  if (isWakingHours(hour)) {
    return CHECK_INTERVAL_MS;
  }
  // Outside waking hours: compute ms until next WAKING_HOUR_START
  const minuteParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const currentHour = Number(minuteParts.find((p) => p.type === 'hour').value);
  const currentMinute = Number(minuteParts.find((p) => p.type === 'minute').value);

  let hoursUntil = WAKING_HOUR_START - currentHour;
  if (hoursUntil <= 0) hoursUntil += 24;
  const msUntil = (hoursUntil * 60 - currentMinute) * 60 * 1000;
  return Math.max(msUntil, 60 * 1000); // minimum 1 minute
}

function scheduleNextRun() {
  const delay = getNextRunDelayMs();
  setTimeout(async () => {
    await runDailyOpsCheck();
    scheduleNextRun();
  }, delay);
}

export function startDailyOps() {
  if (!DAILY_OPS_ENABLED) {
    log.info('Daily ops disabled (DAILY_OPS_ENABLED=false)');
    return;
  }
  const { hour } = pacificNowParts();
  if (isWakingHours(hour)) {
    runDailyOpsCheck();
  }
  scheduleNextRun();
}
