import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';

export const definition = {
  name: 'reminder_set',
  description:
    'Set a reminder at a specific time. Defaults to reminding yourself; can target another household member if you have reminders_others permission.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Reminder message text.',
      },
      target_id: {
        type: 'string',
        description:
          'Optional. Person id or display name to remind. Defaults to the person asking. "me" means yourself.',
      },
      fire_at: {
        type: 'string',
        description:
          'ISO datetime for when to fire (Claude should resolve natural language relative to current Pacific time).',
      },
    },
    required: ['message', 'fire_at'],
  },
};

function resolveMemberId(input, fallbackId) {
  const id = (input || fallbackId || '')
    .toString()
    .trim()
    .toLowerCase();
  if (!id) return null;
  const household = getHousehold();
  if (id === 'me' || id === 'self') return fallbackId || null;
  if (household.members[id]) return id;
  for (const [memberId, member] of Object.entries(household.members)) {
    if (member.display_name?.toLowerCase() === id) return memberId;
  }
  return null;
}

function formatPacific(isoTs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(isoTs));
}

export async function execute(input, envelope) {
  const message = (input?.message || '').trim();
  if (!message) return { error: 'message is required.' };

  const creatorId = resolveMemberId(envelope.person_id, null);
  if (!creatorId) {
    return { error: 'Could not identify who is creating this reminder.' };
  }

  const targetId = resolveMemberId(input?.target_id, creatorId);
  if (!targetId) return { error: 'Unknown target_id. Use a valid household member id or name.' };

  const creatorPerms = envelope.permissions || [];
  const isOtherTarget = targetId !== creatorId;
  if (isOtherTarget && !creatorPerms.includes('reminders_others')) {
    return { error: 'Permission denied: you can only set reminders for yourself.' };
  }

  const household = getHousehold();
  const target = household.members[targetId];
  if (!target) {
    return { error: 'Unknown target_id. Use a valid household member id or name.' };
  }

  if (!target.identifiers?.signal) {
    return { error: `${target.display_name} doesn't have Signal configured, so I can't deliver the reminder.` };
  }

  const fireAtRaw = (input?.fire_at || '').trim();
  const fireAtDate = new Date(fireAtRaw);
  if (!fireAtRaw || Number.isNaN(fireAtDate.getTime())) {
    return { error: 'fire_at must be a valid ISO 8601 timestamp.' };
  }
  if (fireAtDate.getTime() <= Date.now()) {
    return { error: 'That time is in the past. Please specify a future time.' };
  }

  const db = getDb();
  const nowIso = new Date().toISOString();
  const fireAtIso = fireAtDate.toISOString();
  const followUpIso = new Date(fireAtDate.getTime() + 30 * 60 * 1000).toISOString();
  const result = db.prepare(
    `INSERT INTO reminders (
       message, creator_id, target_id, fire_at, status, follow_up_at, snooze_count, created_at, follow_up_count,
       content, target_person_id, requested_by
     )
     VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, 0, ?, ?, ?)`
  ).run(message, creatorId, targetId, fireAtIso, followUpIso, nowIso, message, targetId, creatorId);

  return {
    reminder_id: result.lastInsertRowid,
    message,
    target: target.display_name,
    target_id: targetId,
    fire_at_local: formatPacific(fireAtIso),
    status: 'pending',
  };
}
