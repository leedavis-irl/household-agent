import { getDb } from '../utils/db.js';

export const definition = {
  name: 'knowledge_search',
  description:
    'Search the household knowledge base for information. Use this when someone asks about household logistics, schedules, or anything that might have been previously stored.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — keywords or a natural language question about household info',
      },
    },
    required: ['query'],
  },
};

export async function execute(input) {
  const db = getDb();
  const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);

  // Build a WHERE clause that matches any word in content or tags
  // Also filter out expired entries
  const conditions = words.map(
    () => "(LOWER(content) LIKE ? OR LOWER(COALESCE(tags, '')) LIKE ?)"
  );
  const where = conditions.join(' OR ');
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

  const sql = `
    SELECT id, content, reported_by, reported_at, tags
    FROM knowledge
    WHERE (${where})
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY reported_at DESC
    LIMIT 20
  `;

  const rows = db.prepare(sql).all(...params);

  if (rows.length === 0) {
    return { results: [], message: 'No matching knowledge found.' };
  }

  return {
    results: rows.map((r) => ({
      id: r.id,
      content: r.content,
      reported_by: r.reported_by,
      reported_at: r.reported_at,
      tags: r.tags ? JSON.parse(r.tags) : [],
    })),
  };
}
