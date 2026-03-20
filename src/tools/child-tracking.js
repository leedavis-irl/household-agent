import { getDb } from '../utils/db.js';

const VALID_CATEGORIES = ['homework', 'medical', 'permission_slip'];

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

export const definition = {
  name: 'child_tracking',
  description:
    'Track homework assignments, medical appointments, and permission slip deadlines for children. Use add to create an entry with a due date, query to list upcoming or pending items, and complete to mark an entry done. Automatically sets reminders for upcoming due dates when requested.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'query', 'complete'],
        description:
          'add: create a new tracking entry; query: list entries with optional filters; complete: mark an entry done',
      },
      child_id: {
        type: 'string',
        description:
          'Child name/id (ryker, logan, hazel, aj, alex). For query, omit to see all children.',
      },
      category: {
        type: 'string',
        enum: ['homework', 'medical', 'permission_slip'],
        description:
          'homework: school assignments; medical: appointments and medication; permission_slip: school/activity permission forms',
      },
      title: {
        type: 'string',
        description:
          'Short title for the entry (e.g., "Math worksheet", "Dentist appointment", "Field trip permission slip")',
      },
      description: {
        type: 'string',
        description: 'Optional additional details.',
      },
      due_at: {
        type: 'string',
        description:
          'ISO datetime when this is due (Claude should resolve natural language relative to current Pacific time).',
      },
      status: {
        type: 'string',
        enum: ['pending', 'completed'],
        description: 'For query: filter by status. Defaults to pending.',
      },
      upcoming_days: {
        type: 'number',
        description:
          'For query: show items due within the next N days. Defaults to 7.',
      },
      id: {
        type: 'number',
        description: 'For complete: the ID of the entry to mark done.',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  if (input.action === 'add') {
    if (!input.child_id) return { error: 'add requires child_id' };
    if (!input.category) return { error: 'add requires category' };
    if (!VALID_CATEGORIES.includes(input.category)) {
      return { error: `Invalid category. Use: ${VALID_CATEGORIES.join(', ')}` };
    }
    if (!input.title) return { error: 'add requires title' };

    const childId = input.child_id.toLowerCase();
    const createdBy = envelope?.person || 'unknown';

    if (input.due_at && isNaN(new Date(input.due_at).getTime())) {
      return { error: 'due_at must be a valid ISO 8601 datetime.' };
    }

    const dueAt = input.due_at ? new Date(input.due_at).toISOString() : null;

    const result = db
      .prepare(
        `INSERT INTO child_tracking (child_id, category, title, description, due_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(childId, input.category, input.title, input.description || null, dueAt, createdBy);

    const entry = {
      id: result.lastInsertRowid,
      child_id: childId,
      category: input.category,
      title: input.title,
      due_at: dueAt,
      status: 'pending',
    };

    if (dueAt) {
      entry.due_at_local = formatPacific(dueAt);
      entry.reminder_tip = `Use reminder_set to schedule an alert before this is due.`;
    }

    return { added: true, entry };
  }

  if (input.action === 'query') {
    const childId = input.child_id ? input.child_id.toLowerCase() : null;
    const statusFilter = input.status || 'pending';
    const upcomingDays = input.upcoming_days != null ? input.upcoming_days : 7;

    let query = `SELECT * FROM child_tracking WHERE status = ?`;
    const params = [statusFilter];

    if (childId) {
      query += ` AND child_id = ?`;
      params.push(childId);
    }

    if (input.category) {
      query += ` AND category = ?`;
      params.push(input.category);
    }

    if (statusFilter === 'pending' && upcomingDays > 0) {
      const cutoff = new Date(Date.now() + upcomingDays * 24 * 60 * 60 * 1000).toISOString();
      query += ` AND (due_at IS NULL OR due_at <= ?)`;
      params.push(cutoff);
    }

    query += ` ORDER BY due_at ASC NULLS LAST, created_at ASC`;

    const rows = db.prepare(query).all(...params);

    if (rows.length === 0) {
      return { entries: [], message: 'No matching entries found.' };
    }

    const entries = rows.map((r) => ({
      ...r,
      due_at_local: r.due_at ? formatPacific(r.due_at) : null,
    }));

    return { entries, count: entries.length };
  }

  if (input.action === 'complete') {
    if (!input.id) return { error: 'complete requires id' };

    const existing = db.prepare(`SELECT id, title, child_id FROM child_tracking WHERE id = ?`).get(input.id);
    if (!existing) return { error: `Entry not found: id ${input.id}` };

    const completedAt = new Date().toISOString();
    db.prepare(
      `UPDATE child_tracking SET status = 'completed', completed_at = ? WHERE id = ?`
    ).run(completedAt, input.id);

    return {
      completed: true,
      id: input.id,
      title: existing.title,
      child_id: existing.child_id,
      completed_at: completedAt,
    };
  }

  return { error: `Unknown action: ${input.action}. Use add, query, or complete.` };
}
