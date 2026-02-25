import { think } from '../brain/index.js';
import { getHousehold } from './config.js';
import { sendMessage } from '../broker/signal.js';
import log from './logger.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const BRIEFING_HOUR = Number(process.env.BRIEFING_HOUR || 7);
const BRIEFING_ENABLED = process.env.BRIEFING_ENABLED !== 'false';
const BRIEFING_RECIPIENTS = (process.env.BRIEFING_RECIPIENTS || 'lee,kelly')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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

async function runMorningBriefingCycle() {
  if (!BRIEFING_ENABLED) return;
  const { hour, minute, dateKey, longDate } = pacificNowParts();
  if (hour !== BRIEFING_HOUR || minute !== 0) return;

  const household = getHousehold();
  for (const personId of BRIEFING_RECIPIENTS) {
    const sentKey = `${personId}:${dateKey}`;
    if (sentToday.has(sentKey)) continue;
    sentToday.add(sentKey);

    const member = household.members[personId];
    if (!member?.identifiers?.signal) {
      log.error('Morning briefing skipped: recipient missing Signal', { person_id: personId });
      continue;
    }

    const envelope = {
      person_id: personId,
      person: member.display_name,
      role: member.role,
      permissions: member.permissions || [],
      message: `Generate a morning briefing for ${member.display_name}. Today is ${longDate}.

Check the following and include anything noteworthy:
1. Their calendar for today — events, times, locations. Also check for conflicts across household members (e.g., two adults both marked for school pickup but one has a conflicting meeting).
2. Current weather conditions and today's forecast — mention if it affects plans (rain during outdoor event, cold snap, etc.).
3. Their pending reminders firing today.
4. Anything stored in household knowledge in the last 24 hours that's relevant to them.

Keep it concise — this is a Signal message, not an email. Lead with the most important item. Skip sections that have nothing noteworthy (don't say "no reminders today" — just omit it). Write naturally, like a Chief of Staff giving a verbal briefing.`,
      source_channel: 'signal',
      reply_address: member.identifiers.signal,
      conversation_id: `briefing-${dateKey}`,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await think(envelope);
      const delivered = sendMessage(member.identifiers.signal, response);
      if (!delivered) {
        log.error('Morning briefing send failed: Signal unavailable', { person_id: personId });
      } else {
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
