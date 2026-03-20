import { getDb } from '../utils/db.js';

export const definition = {
  name: 'escalation_log',
  description:
    'Add, list, or remove escalation rules — topics Iji should defer to Lee rather than attempting autonomously. Use add to create a new rule (e.g., "don\'t try to give tax advice, suggest calling Peter at Goldman Sachs"), list to view all rules, remove to delete a rule by ID.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'remove'],
        description:
          'add: create a new escalation rule; list: view all active rules; remove: delete a rule by ID',
      },
      pattern: {
        type: 'string',
        description:
          'For add: keyword or topic that triggers escalation (e.g., "legal questions", "tax advice", "medical diagnosis")',
      },
      category: {
        type: 'string',
        description: 'For add: category label (e.g., "legal", "tax", "medical", "financial")',
      },
      reason: {
        type: 'string',
        description:
          'For add: what Iji should say or do instead (e.g., "Tell people to ask Lee directly", "Suggest calling Peter at Goldman Sachs")',
      },
      id: {
        type: 'number',
        description: 'For remove: the ID of the escalation rule to delete',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  if (input.action === 'add') {
    if (!input.pattern) return { error: 'add action requires a pattern' };
    if (!input.category) return { error: 'add action requires a category' };
    if (!input.reason) return { error: 'add action requires a reason' };

    const result = db
      .prepare(
        'INSERT INTO escalation_patterns (pattern, category, reason, created_by) VALUES (?, ?, ?, ?)'
      )
      .run(input.pattern, input.category, input.reason, envelope?.person || 'unknown');

    return {
      added: true,
      id: result.lastInsertRowid,
      pattern: input.pattern,
      category: input.category,
      reason: input.reason,
    };
  }

  if (input.action === 'list') {
    const rows = db
      .prepare(
        'SELECT id, pattern, category, reason, created_by, created_at FROM escalation_patterns ORDER BY created_at DESC'
      )
      .all();

    if (rows.length === 0) {
      return { rules: [], message: 'No escalation rules defined yet.' };
    }

    return { rules: rows, count: rows.length };
  }

  if (input.action === 'remove') {
    if (!input.id) return { error: 'remove action requires an id' };

    const existing = db.prepare('SELECT id FROM escalation_patterns WHERE id = ?').get(input.id);
    if (!existing) return { error: `Escalation rule not found: id ${input.id}` };

    db.prepare('DELETE FROM escalation_patterns WHERE id = ?').run(input.id);
    return { removed: true, id: input.id };
  }

  return { error: `Unknown action: ${input.action}. Use add, list, or remove.` };
}
