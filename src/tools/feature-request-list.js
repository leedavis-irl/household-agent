import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feature_request_list',
  description: 'List feature requests. Admin only. Defaults to showing new/unreviewed requests.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: new, accepted, declined, merged, built. Default: new',
      },
    },
  },
};

export async function execute(input, envelope) {
  if (envelope.role !== 'admin') {
    return { error: 'Only admins can view feature requests.' };
  }

  const db = getDb();
  const status = input?.status || 'new';

  const rows = db
    .prepare(
      'SELECT id, requester_id, request_text, status, triage_notes, created_at, triaged_at FROM feature_requests WHERE status = ? ORDER BY created_at DESC'
    )
    .all(status);

  return { requests: rows, count: rows.length };
}
