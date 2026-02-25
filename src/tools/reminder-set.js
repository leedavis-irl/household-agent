import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';

export const definition = {
  name: 'reminder_set',
  description:
    'Set a reminder for a household member. Iji will deliver the reminder via Signal DM at the specified time.',
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description:
          'Who receives the reminder. Member id or display name. Defaults to the person speaking.',
      },
      content: {
        type: 'string',
        description: 'What to remind them about.',
      },
      fire_at: {
        type: 'string',
        description:
          'When to fire. ISO 8601 UTC timestamp. Relative times should be converted to absolute UTC first.',
      },
    },
    required: ['content', 'fire_at'],
  },
};

function resolvePersonId(personInput, envelope) {
  const id = (personInput || envelope.person_id || envelope.person || '')
    .toString()
    .trim()
    .toLowerCase();
  if (!id) return null;
  const household = getHousehold();
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
  const content = (input?.content || '').trim();
  if (!content) return { error: 'content is required.' };

  const targetPersonId = resolvePersonId(input?.person, envelope);
  if (!targetPersonId) {
    return { error: "Could not identify who to remind. Use a member name like 'steve' or 'lee'." };
  }

  const household = getHousehold();
  const target = household.members[targetPersonId];
  if (!target) {
    return { error: "Could not identify who to remind. Use a member name like 'steve' or 'lee'." };
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
  const result = db.prepare(
    `INSERT INTO reminders (content, target_person_id, requested_by, fire_at, created_at, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(content, targetPersonId, envelope.person_id || 'unknown', fireAtIso, nowIso);

  return {
    reminder_id: result.lastInsertRowid,
    content,
    target: target.display_name,
    fire_at_local: formatPacific(fireAtIso),
  };
}
