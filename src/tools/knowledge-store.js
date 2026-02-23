import { getDb } from '../utils/db.js';

export const definition = {
  name: 'knowledge_store',
  description:
    'Store a new piece of household knowledge. Use this when someone tells you information worth remembering — dinner plans, appointments, household events, etc.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The information to store',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorizing the knowledge (e.g., "dinner", "schedule", "maintenance")',
      },
      expires_at: {
        type: 'string',
        description:
          'Optional ISO 8601 expiry datetime. Use for time-sensitive info (e.g., "dinner at 7" should expire end of day).',
      },
    },
    required: ['content'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  const result = db
    .prepare(
      'INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      input.content,
      envelope.person,
      new Date().toISOString(),
      input.expires_at || null,
      JSON.stringify(input.tags || [])
    );

  return { stored: true, id: result.lastInsertRowid };
}
