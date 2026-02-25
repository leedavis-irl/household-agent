import { getDb } from '../utils/db.js';

export const definition = {
  name: 'reminder_cancel',
  description: 'Cancel a pending reminder by ID.',
  input_schema: {
    type: 'object',
    properties: {
      reminder_id: {
        type: 'number',
        description: 'The reminder ID from reminder_list results.',
      },
    },
    required: ['reminder_id'],
  },
};

export async function execute(input, envelope) {
  const reminderId = Number(input?.reminder_id);
  if (!Number.isInteger(reminderId) || reminderId <= 0) {
    return { error: 'reminder_id must be a positive integer.' };
  }

  const db = getDb();
  const reminder = db.prepare(
    `SELECT id, content, target_person_id, requested_by, status
     FROM reminders WHERE id = ?`
  ).get(reminderId);

  if (!reminder) {
    return { error: `Reminder #${reminderId} was not found.` };
  }
  if (reminder.status === 'fired') {
    return { error: `Reminder #${reminderId} already fired and cannot be cancelled.` };
  }
  if (reminder.status === 'cancelled') {
    return { error: `Reminder #${reminderId} is already cancelled.` };
  }

  const actorId = (envelope.person_id || '').toLowerCase();
  const isAdmin = (envelope.role || '').toLowerCase() === 'admin';
  const canCancel = isAdmin || actorId === reminder.target_person_id || actorId === reminder.requested_by;
  if (!canCancel) {
    return { error: 'Permission denied: you can only cancel your own reminders unless you are admin.' };
  }

  db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`).run(reminderId);
  return { cancelled: true, content: reminder.content };
}
