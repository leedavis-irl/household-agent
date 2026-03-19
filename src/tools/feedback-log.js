import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feedback_log',
  description:
    'Record or retrieve feedback on past suggestions (restaurants, activities, products, etc.). Use record to log how a suggestion went; use query to look up past feedback before making similar suggestions.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['record', 'query'],
        description: 'record: log feedback on a past suggestion; query: retrieve feedback by topic',
      },
      topic: {
        type: 'string',
        description:
          'The topic or category of the suggestion (e.g., "restaurants", "activities", "products", "movies"). Used for both recording and querying.',
      },
      subject: {
        type: 'string',
        description:
          'For record: the specific thing being rated (e.g., "Chez Panisse", "hiking at Tilden Park"). Required for record.',
      },
      rating: {
        type: 'number',
        description: 'For record: rating from 1 (terrible) to 5 (excellent). Required for record.',
      },
      notes: {
        type: 'string',
        description: 'For record: optional notes about the experience.',
      },
    },
    required: ['action', 'topic'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  if (input.action === 'record') {
    if (!input.subject) {
      return { error: 'record action requires a subject (the specific thing being rated)' };
    }
    if (input.rating == null) {
      return { error: 'record action requires a rating (1–5)' };
    }
    if (input.rating < 1 || input.rating > 5) {
      return { error: 'rating must be between 1 and 5' };
    }

    const ratingInt = Math.round(input.rating);
    const notes = input.notes ? ` Notes: ${input.notes}` : '';
    const content = `Feedback on ${input.topic} — "${input.subject}": ${ratingInt}/5.${notes}`;
    const tags = JSON.stringify(['feedback', 'suggestion-feedback', input.topic.toLowerCase()]);

    const result = db
      .prepare(
        'INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)'
      )
      .run(content, envelope?.person || 'unknown', new Date().toISOString(), null, tags);

    return {
      recorded: true,
      id: result.lastInsertRowid,
      summary: content,
    };
  }

  if (input.action === 'query') {
    const topicLower = input.topic.toLowerCase();

    const rows = db
      .prepare(
        `SELECT id, content, reported_by, reported_at, tags
         FROM knowledge
         WHERE LOWER(COALESCE(tags, '')) LIKE ?
           AND LOWER(COALESCE(tags, '')) LIKE '%suggestion-feedback%'
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         ORDER BY reported_at DESC
         LIMIT 50`
      )
      .all(`%${topicLower}%`);

    if (rows.length === 0) {
      return { results: [], message: `No feedback found for topic: ${input.topic}` };
    }

    return {
      results: rows.map((r) => ({
        id: r.id,
        content: r.content,
        reported_by: r.reported_by,
        reported_at: r.reported_at,
        tags: r.tags ? JSON.parse(r.tags) : [],
      })),
      count: rows.length,
    };
  }

  return { error: `Unknown action: ${input.action}. Use record or query.` };
}
