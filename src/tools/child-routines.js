import { getDb } from '../utils/db.js';

// Default routine items per period — used when initializing a child's day
const DEFAULT_ITEMS = {
  morning: ['brush_teeth', 'get_dressed', 'eat_breakfast', 'pack_bag'],
  evening: ['homework', 'brush_teeth', 'reading', 'pack_bag_for_tomorrow'],
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Ensure a child has routine rows for the given date/period, inserting defaults if missing
function ensureDayExists(db, childId, period, date) {
  const items = DEFAULT_ITEMS[period] || [];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO child_routines (child_id, item, period, date) VALUES (?, ?, ?, ?)`
  );
  for (const item of items) {
    insert.run(childId, item, period, date);
  }
}

const KNOWN_CHILDREN = ['ryker', 'logan', 'hazel', 'aj', 'alex'];

export const definition = {
  name: 'child_routines',
  description:
    'Track and check off AM/PM routine items for children. Use check_off to mark an item done, query to see completion status for today or a specific date, add_item to add a custom routine item, and reset to clear completions for re-testing. Supports morning and evening routines.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['check_off', 'query', 'add_item', 'reset'],
        description:
          'check_off: mark a routine item complete; query: see status for a child or all children; add_item: add a custom item to a child\'s routine; reset: clear completions for the day',
      },
      child_id: {
        type: 'string',
        description:
          'Child name/id (ryker, logan, hazel, aj, alex). For query and reset, omit to include all children.',
      },
      item: {
        type: 'string',
        description:
          'Routine item name (e.g., "brush_teeth", "reading", "pack_bag"). Required for check_off and add_item.',
      },
      period: {
        type: 'string',
        enum: ['morning', 'evening'],
        description: 'morning or evening. Defaults to morning.',
      },
      date: {
        type: 'string',
        description: 'ISO date (YYYY-MM-DD). Defaults to today.',
      },
      completed_by: {
        type: 'string',
        description: 'For check_off: who is checking this off (person id or name).',
      },
      notes: {
        type: 'string',
        description: 'Optional notes when checking off an item.',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();
  const date = input.date || todayDate();
  const period = input.period || 'morning';

  if (input.action === 'query') {
    const childrenToQuery = input.child_id
      ? [input.child_id.toLowerCase()]
      : KNOWN_CHILDREN;

    const results = {};
    for (const childId of childrenToQuery) {
      // Auto-initialize morning rows if querying today and none exist
      if (date === todayDate()) {
        ensureDayExists(db, childId, period, date);
      }

      const rows = db
        .prepare(
          `SELECT item, period, completed, completed_at, completed_by, notes
           FROM child_routines
           WHERE child_id = ? AND date = ?
           ORDER BY period, item`
        )
        .all(childId, date);

      if (rows.length > 0) {
        results[childId] = rows;
      }
    }

    if (Object.keys(results).length === 0) {
      const childLabel = input.child_id || 'any child';
      return { routines: {}, message: `No routine data found for ${childLabel} on ${date}.` };
    }

    // Compute summary stats
    const summary = {};
    for (const [childId, items] of Object.entries(results)) {
      const total = items.length;
      const done = items.filter((i) => i.completed).length;
      summary[childId] = { items, total, done, outstanding: total - done };
    }

    return { date, routines: summary };
  }

  if (input.action === 'check_off') {
    if (!input.child_id) return { error: 'check_off requires child_id' };
    if (!input.item) return { error: 'check_off requires item' };

    const childId = input.child_id.toLowerCase();
    const item = input.item.toLowerCase();

    // Ensure the row exists (auto-insert if it's a known default item)
    const existing = db
      .prepare(
        `SELECT id, completed FROM child_routines WHERE child_id = ? AND item = ? AND period = ? AND date = ?`
      )
      .get(childId, item, period, date);

    if (!existing) {
      // Insert the item if not present
      db.prepare(
        `INSERT OR IGNORE INTO child_routines (child_id, item, period, date) VALUES (?, ?, ?, ?)`
      ).run(childId, item, period, date);
    }

    const completedBy = input.completed_by || envelope?.person || 'unknown';
    const completedAt = new Date().toISOString();

    db.prepare(
      `UPDATE child_routines
       SET completed = 1, completed_at = ?, completed_by = ?, notes = ?
       WHERE child_id = ? AND item = ? AND period = ? AND date = ?`
    ).run(completedAt, completedBy, input.notes || null, childId, item, period, date);

    return {
      checked_off: true,
      child_id: childId,
      item,
      period,
      date,
      completed_by: completedBy,
    };
  }

  if (input.action === 'add_item') {
    if (!input.child_id) return { error: 'add_item requires child_id' };
    if (!input.item) return { error: 'add_item requires item' };

    const childId = input.child_id.toLowerCase();
    const item = input.item.toLowerCase();

    const result = db
      .prepare(
        `INSERT OR IGNORE INTO child_routines (child_id, item, period, date) VALUES (?, ?, ?, ?)`
      )
      .run(childId, item, period, date);

    if (result.changes === 0) {
      return {
        added: false,
        message: `Item "${item}" already exists for ${childId} ${period} routine on ${date}.`,
      };
    }

    return { added: true, child_id: childId, item, period, date };
  }

  if (input.action === 'reset') {
    const childId = input.child_id ? input.child_id.toLowerCase() : null;

    if (childId) {
      db.prepare(
        `UPDATE child_routines SET completed = 0, completed_at = NULL, completed_by = NULL, notes = NULL
         WHERE child_id = ? AND date = ?`
      ).run(childId, date);
      return { reset: true, child_id: childId, date };
    } else {
      db.prepare(
        `UPDATE child_routines SET completed = 0, completed_at = NULL, completed_by = NULL, notes = NULL
         WHERE date = ?`
      ).run(date);
      return { reset: true, all_children: true, date };
    }
  }

  return { error: `Unknown action: ${input.action}. Use check_off, query, add_item, or reset.` };
}
