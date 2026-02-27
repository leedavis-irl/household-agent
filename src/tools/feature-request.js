import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feature_request',
  description: 'Log a feature request or suggestion from a household member. Use when someone says "I wish you could...", "feature request:", "it would be nice if...", "can you add...", or similar.',
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'What the person wants Iji to be able to do',
      },
    },
    required: ['request'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  const result = db
    .prepare(
      'INSERT INTO feature_requests (requester_id, request_text) VALUES (?, ?)'
    )
    .run(envelope.person, input.request);

  return { submitted: true, id: result.lastInsertRowid };
}
