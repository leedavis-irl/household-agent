import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';

export const definition = {
  name: 'reminder_list',
  description: 'List pending reminders for a household member.',
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description: 'Whose reminders to list. Default: the person speaking.',
      },
      include_fired: {
        type: 'boolean',
        description: 'Include reminders that already fired today. Default: false.',
      },
    },
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

function pacificDateKey(isoTs) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoTs));
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
  const includeFired = !!input?.include_fired;
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: "Could not identify whose reminders to list. Use a member name like 'steve' or 'lee'." };
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT id, content, fire_at, fired_at, status
     FROM reminders
     WHERE target_person_id = ?
       AND (status = 'pending' OR status = 'fired')
     ORDER BY fire_at ASC`
  ).all(personId);

  const todayPacific = pacificDateKey(new Date().toISOString());
  const filtered = rows.filter((r) => {
    if (r.status === 'pending') return true;
    if (!includeFired) return false;
    return r.fired_at && pacificDateKey(r.fired_at) === todayPacific;
  });

  const reminders = filtered.map((r) => {
    if (r.status === 'fired') {
      return `#${r.id} — ${r.content} (fired at ${formatPacific(r.fired_at)} ✓)`;
    }
    return `#${r.id} — ${r.content} (fires at ${formatPacific(r.fire_at)})`;
  });

  const pendingCount = filtered.filter((r) => r.status === 'pending').length;
  return {
    reminders,
    message: pendingCount === 0
      ? 'You have no pending reminders.'
      : `You have ${pendingCount} pending reminder${pendingCount === 1 ? '' : 's'}.`,
  };
}
