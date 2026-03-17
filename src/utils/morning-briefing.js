import { think } from '../brain/index.js';
import { getHousehold } from './config.js';
import { getDb } from './db.js';
import { sendMessage } from '../broker/signal.js';
import { getEffectiveBriefingConfig } from './briefing-preferences.js';
import log from './logger.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const BRIEFING_ENABLED = process.env.BRIEFING_ENABLED !== 'false';

const sentToday = new Set();

function pacificNowParts() {
  const d = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).format(d));
  const minute = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    minute: 'numeric',
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
  return { hour, minute, dateKey, longDate };
}

function hasConversationEvalFor(conversationId) {
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT 1
       FROM conversation_evals
       WHERE conversation_id = ?
       LIMIT 1`
    ).get(conversationId);
    return !!row;
  } catch (err) {
    log.warn('Morning briefing dedupe check failed', {
      conversation_id: conversationId,
      error: err.message,
    });
    return false;
  }
}

async function runMorningBriefingCycle() {
  if (!BRIEFING_ENABLED) return;
  const { hour, dateKey, longDate } = pacificNowParts();

  const household = getHousehold();
  for (const [personId, member] of Object.entries(household.members || {})) {
    const config = getEffectiveBriefingConfig(personId, member);
    if (!config?.enabled) continue;
    const deliveryHour = config.deliveryHour;
    if (!Number.isInteger(deliveryHour) || deliveryHour < 0 || deliveryHour > 23) {
      log.warn('Morning briefing skipped: invalid delivery_hour', { person_id: personId, delivery_hour: deliveryHour });
      continue;
    }
    if (hour < deliveryHour) continue;

    const sentKey = `${personId}:${dateKey}`;
    if (sentToday.has(sentKey)) continue;

    const conversationId = `briefing-${personId}-${dateKey}`;
    if (hasConversationEvalFor(conversationId)) {
      sentToday.add(sentKey);
      continue;
    }

    if (!member?.identifiers?.signal) {
      log.warn('Morning briefing skipped: recipient missing Signal', { person_id: personId });
      continue;
    }

    let featureRequestsLine = '';
    if (member.role === 'admin') {
      try {
        const db = getDb();
        const row = db
          .prepare(`SELECT COUNT(*) as count FROM feature_requests WHERE status = 'new'`)
          .get();
        const count = Number(row?.count || 0);
        if (count > 0) {
          featureRequestsLine = `\n6. 📋 ${count} new feature request${count > 1 ? 's' : ''} to review.`;
        }
      } catch (err) {
        log.warn('Morning briefing feature request count failed', {
          person_id: personId,
          error: err.message,
        });
      }
    }

    const envelope = {
      person_id: personId,
      person: member.display_name,
      role: member.role,
      permissions: member.permissions || [],
      message: `Generate a morning briefing for ${member.display_name}. Today is ${longDate}.

Check the following and include anything noteworthy:
1. Their calendar for today — events, times, locations. Flag conflicts with other household members if you spot them.
2. Current weather and today's forecast — mention only if it affects plans or is notable.
3. Pending reminders due today or overdue.
4. Anything stored in household knowledge in the last 24 hours that's relevant to them.
5. Any tasks assigned to them that are overdue or due today.
${featureRequestsLine}

Keep it concise — this is a Signal message, not an email. Lead with the most important item. Skip sections with nothing noteworthy (don't say "no reminders" — just omit). Write like a Chief of Staff giving a 30-second verbal briefing.`,
      source_channel: 'signal',
      reply_address: member.identifiers.signal,
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await think(envelope);
      const delivered = sendMessage(member.identifiers.signal, response);
      if (!delivered) {
        log.error('Morning briefing send failed: Signal unavailable', { person_id: personId });
      } else {
        sentToday.add(sentKey);
        log.info('Morning briefing sent', { person_id: personId, date: dateKey });
      }
    } catch (err) {
      log.error('Morning briefing failed', { person_id: personId, error: err.message });
    }
  }

  for (const key of [...sentToday]) {
    if (!key.endsWith(`:${dateKey}`)) sentToday.delete(key);
  }
}

export function startMorningBriefing() {
  runMorningBriefingCycle();
  setInterval(runMorningBriefingCycle, CHECK_INTERVAL_MS);
}
