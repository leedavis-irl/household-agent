import { getDb } from '../utils/db.js';

export const definition = {
  name: 'feature_request_triage',
  description: 'Triage a feature request — accept, decline, merge, or mark as built. Admin only. Optionally notify the requester via Signal DM.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: 'Feature request ID',
      },
      status: {
        type: 'string',
        description: 'New status: accepted, declined, merged, built',
      },
      triage_notes: {
        type: 'string',
        description: 'Reasoning for the decision',
      },
      notify_requester: {
        type: 'boolean',
        description: 'Send a Signal DM to the requester about the decision. Default: false',
      },
    },
    required: ['id', 'status'],
  },
};

const VALID_STATUSES = ['new', 'accepted', 'declined', 'merged', 'built'];

export async function execute(input, envelope) {
  if (envelope.role !== 'admin') {
    return { error: 'Only admins can triage feature requests.' };
  }

  if (!VALID_STATUSES.includes(input.status)) {
    return { error: `Invalid status: ${input.status}. Must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  const db = getDb();

  const existing = db
    .prepare('SELECT * FROM feature_requests WHERE id = ?')
    .get(input.id);

  if (!existing) {
    return { error: `Feature request ${input.id} not found.` };
  }

  db.prepare(
    'UPDATE feature_requests SET status = ?, triage_notes = ?, triaged_at = datetime(\'now\') WHERE id = ?'
  ).run(input.status, input.triage_notes || null, input.id);

  const result = { updated: true, id: input.id, status: input.status };

  if (input.notify_requester) {
    result.notify = {
      requester_id: existing.requester_id,
      request_text: existing.request_text,
      new_status: input.status,
    };
  }

  return result;
}
