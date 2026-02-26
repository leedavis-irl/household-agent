import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';

export const definition = {
  name: 'reminder_list',
  description: 'List active reminders (pending/snoozed) for yourself or another household member.',
  input_schema: {
    type: 'object',
    properties: {
      target_id: {
        type: 'string',
        description: 'Optional. Member id or display name. Defaults to the person asking.',
      },
    },
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
  }).format(new Date(isoTs));
}

export async function execute(input, envelope) {
  const actorId = resolveMemberId(envelope.person_id, null);
  if (!actorId) return { error: 'Could not identify who is requesting reminders.' };

  const targetId = resolveMemberId(input?.target_id, actorId);
  if (!targetId) {
    return { error: 'Unknown target_id. Use a valid household member id or name.' };
  }

  const isOtherTarget = targetId !== actorId;
  if (isOtherTarget && !(envelope.permissions || []).includes('reminders_others')) {
    return { error: 'Permission denied: you can only list your own reminders.' };
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT id,
            COALESCE(message, content) AS message,
            COALESCE(target_id, target_person_id) AS target_id,
            fire_at,
            status,
            COALESCE(snooze_count, 0) AS snooze_count
     FROM reminders
     WHERE COALESCE(target_id, target_person_id) = ?
       AND status IN ('pending', 'snoozed')
     ORDER BY fire_at ASC`
  ).all(targetId);

  const reminders = rows.map((r) => ({
    id: r.id,
    message: r.message,
    fire_at_local: formatPacific(r.fire_at),
    status: r.status,
    snooze_count: r.snooze_count,
  }));

  const household = getHousehold();
  const targetName = household.members[targetId]?.display_name || targetId;
  return {
    reminders,
    target: targetName,
    message: reminders.length === 0
      ? `${targetName} has no active reminders.`
      : `${targetName} has ${reminders.length} active reminder${reminders.length === 1 ? '' : 's'}.`,
  };
}
