import { getDb } from '../utils/db.js';

const VALID_CATEGORIES = ['education', 'finance', 'home', 'health', 'logistics'];

export const definition = {
  name: 'decision_log',
  description:
    'Record or search major household decisions with structured rationale. Use record to log decisions like "chose public school over private for Ryker because of 504 support". Use search to find past decisions by keyword or category. Distinct from knowledge_store — this is for permanent, structured decisions with explicit rationale and alternatives considered.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['record', 'search'],
        description: 'record: log a new decision; search: find past decisions by keyword or category',
      },
      title: {
        type: 'string',
        description: 'For record: short title summarizing the decision (e.g., "Kept Ryker at John Muir Elementary")',
      },
      description: {
        type: 'string',
        description: 'For record: full description of what was decided',
      },
      rationale: {
        type: 'string',
        description: 'For record: why this decision was made — the reasoning behind the choice',
      },
      alternatives_considered: {
        type: 'string',
        description: 'For record: what other options were considered and why they were rejected',
      },
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'For record: household members involved in making the decision (e.g., ["lee", "hallie"])',
      },
      category: {
        type: 'string',
        enum: ['education', 'finance', 'home', 'health', 'logistics'],
        description: 'Category for the decision',
      },
      query: {
        type: 'string',
        description: 'For search: keyword to search in title, description, or rationale',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  if (input.action === 'record') {
    if (!input.title) return { error: 'record action requires a title' };
    if (!input.rationale) return { error: 'record action requires a rationale' };
    if (!input.category) return { error: 'record action requires a category' };
    if (!VALID_CATEGORIES.includes(input.category)) {
      return { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` };
    }

    const result = db
      .prepare(
        `INSERT INTO decisions
           (title, description, rationale, alternatives_considered, participants, decided_by, decided_at, category, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        input.title,
        input.description || null,
        input.rationale,
        input.alternatives_considered || null,
        JSON.stringify(input.participants || []),
        envelope?.person || 'unknown',
        new Date().toISOString(),
        input.category
      );

    return {
      recorded: true,
      id: result.lastInsertRowid,
      title: input.title,
      category: input.category,
    };
  }

  if (input.action === 'search') {
    const conditions = [];
    const params = [];

    if (input.query) {
      const q = `%${input.query.toLowerCase()}%`;
      conditions.push(
        `(LOWER(title) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ? OR LOWER(rationale) LIKE ? OR LOWER(COALESCE(alternatives_considered,'')) LIKE ?)`
      );
      params.push(q, q, q, q);
    }

    if (input.category) {
      conditions.push(`category = ?`);
      params.push(input.category);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT id, title, description, rationale, alternatives_considered, participants, decided_by, decided_at, category, status
         FROM decisions
         ${where}
         ORDER BY decided_at DESC
         LIMIT 20`
      )
      .all(...params);

    if (rows.length === 0) {
      const qualifier = input.category ? ` in category '${input.category}'` : '';
      const keyword = input.query ? ` matching '${input.query}'` : '';
      return { results: [], message: `No decisions found${qualifier}${keyword}` };
    }

    return {
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        rationale: r.rationale,
        alternatives_considered: r.alternatives_considered,
        participants: r.participants ? JSON.parse(r.participants) : [],
        decided_by: r.decided_by,
        decided_at: r.decided_at,
        category: r.category,
        status: r.status,
      })),
      count: rows.length,
    };
  }

  return { error: `Unknown action: ${input.action}. Use record or search.` };
}
