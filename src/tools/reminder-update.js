import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';
import { sendMessage } from '../broker/signal.js';

export const definition = {
  name: 'reminder_update',
  description: 'Update a reminder: complete, snooze, or cancel.',
  input_schema: {
    type: 'object',
    properties: {
      reminder_id: {
        type: 'number',
        description: 'Reminder ID from reminder_list.',
      },
      action: {
        type: 'string',
        enum: ['complete', 'snooze', 'cancel'],
        description: 'Update action to apply.',
      },
      snooze_until: {
        type: 'string',
        description: 'Required for action=snooze. ISO datetime for next reminder time.',
      },
    },
    required: ['reminder_id', 'action'],
  },
};

function formatPacific(isoTs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(isoTs));
}

function canUpdateReminder(envelope, reminder) {
  const actorId = (envelope.person_id || '').toLowerCase();
  const perms = envelope.permissions || [];
  if (actorId === reminder.target_id) return true;
  if (actorId === reminder.creator_id && perms.includes('reminders_others')) return true;
  return false;
}

function notifyCreatorIfNeeded(reminder, text) {
  if (!reminder.creator_signal || reminder.creator_id === reminder.target_id) return;
  sendMessage(reminder.creator_signal, text);
}

export async function execute(input, envelope) {
  const reminderId = Number(input?.reminder_id);
  const action = (input?.action || '').toLowerCase();
  if (!Number.isInteger(reminderId) || reminderId <= 0) {
    return { error: 'reminder_id must be a positive integer.' };
  }
  if (!['complete', 'snooze', 'cancel'].includes(action)) {
    return { error: "action must be one of: complete, snooze, cancel." };
  }

  const db = getDb();
  const reminder = db.prepare(
    `SELECT id,
            COALESCE(message, content) AS message,
            COALESCE(creator_id, requested_by) AS creator_id,
            COALESCE(target_id, target_person_id) AS target_id,
            fire_at,
            status,
            COALESCE(snooze_count, 0) AS snooze_count
     FROM reminders
     WHERE id = ?`
  ).get(reminderId);
  if (!reminder) return { error: `Reminder #${reminderId} was not found.` };

  if (!canUpdateReminder(envelope, reminder)) {
    return { error: 'Permission denied: you can only update reminders assigned to you.' };
  }

  const household = getHousehold();
  const creatorName = household.members[reminder.creator_id]?.display_name || reminder.creator_id;
  const targetName = household.members[reminder.target_id]?.display_name || reminder.target_id;
  reminder.creator_signal = household.members[reminder.creator_id]?.identifiers?.signal || null;

  if (action === 'complete') {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);
    notifyCreatorIfNeeded(reminder, `✅ ${targetName} completed: ${reminder.message}`);
    return {
      updated: true,
      action: 'complete',
      reminder_id: reminderId,
      message: reminder.message,
      target: targetName,
      creator: creatorName,
    };
  }

  if (action === 'cancel') {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);
    notifyCreatorIfNeeded(reminder, `🚫 ${targetName} cancelled: ${reminder.message}`);
    return {
      updated: true,
      action: 'cancel',
      reminder_id: reminderId,
      message: reminder.message,
      target: targetName,
      creator: creatorName,
    };
  }

  const snoozeUntilRaw = (input?.snooze_until || '').trim();
  const snoozeDate = new Date(snoozeUntilRaw);
  if (!snoozeUntilRaw || Number.isNaN(snoozeDate.getTime())) {
    return { error: 'snooze_until must be a valid ISO timestamp for action=snooze.' };
  }
  if (snoozeDate.getTime() <= Date.now()) {
    return { error: 'snooze_until must be in the future.' };
  }

  const snoozeIso = snoozeDate.toISOString();
  const followUpIso = new Date(snoozeDate.getTime() + 30 * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE reminders
     SET fire_at = ?,
         follow_up_at = ?,
         status = 'pending',
         snooze_count = COALESCE(snooze_count, 0) + 1,
         follow_up_count = 0
     WHERE id = ?`
  ).run(snoozeIso, followUpIso, reminderId);

  return {
    updated: true,
    action: 'snooze',
    reminder_id: reminderId,
    message: reminder.message,
    target: targetName,
    fire_at_local: formatPacific(snoozeIso),
  };
}
