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

const NWS_USER_AGENT = 'Iji Household Agent, contact@email.com';
const DEFAULT_LAT = 37.8716;
const DEFAULT_LNG = -122.2727;

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

async function checkRainStartingSoon() {
  try {
    const pointsUrl = `https://api.weather.gov/points/${DEFAULT_LAT},${DEFAULT_LNG}`;
    const pointsRes = await fetch(pointsUrl, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    });
    if (!pointsRes.ok) return null;
    const pointsData = await pointsRes.json();
    const hourlyUrl = pointsData?.properties?.forecastHourly;
    if (!hourlyUrl) return null;

    const hourlyRes = await fetch(hourlyUrl, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    });
    if (!hourlyRes.ok) return null;
    const hourlyData = await hourlyRes.json();
    const periods = (hourlyData?.properties?.periods || []).slice(0, 4);

    for (const period of periods) {
      const precip = period?.probabilityOfPrecipitation?.value;
      if (precip != null && precip >= 50) {
        const startTime = period.startTime ? new Date(period.startTime) : null;
        const timeStr = startTime
          ? startTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles',
            })
          : 'soon';
        return {
          probability: precip,
          shortForecast: period.shortForecast || 'Rain',
          time: timeStr,
          startTime: period.startTime,
        };
      }
    }
    return null;
  } catch (err) {
    log.warn('Daily ops: weather check failed', { error: err.message });
    return null;
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

  // Rain starting in the next 4 hours (dedup once per day per person)
  const rainKey = `${personId}:weather-rain:${dateKey}`;
  if (!sentToday.has(rainKey)) {
    const rain = await checkRainStartingSoon();
    if (rain) {
      items.push({ type: 'weather', key: rainKey, ...rain });
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
        if (i.type === 'weather') return `- Rain starting around ${i.time} (${i.probability}% chance, ${i.shortForecast})`;
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

Check any relevant details needed for context (e.g. if an outdoor event or kid pickup is involved, check weather; if a task is overdue, give a brief note). Send a concise Signal message — 1-3 sentences max. Focus only on what's immediately actionable. Write like a Chief of Staff giving a quick heads-up.

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

export function startDailyOps() {
  if (!DAILY_OPS_ENABLED) {
    log.info('Daily ops disabled (DAILY_OPS_ENABLED=false)');
    return;
  }
  runDailyOpsCheck();
  setInterval(runDailyOpsCheck, CHECK_INTERVAL_MS);
}
