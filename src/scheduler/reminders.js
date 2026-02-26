import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';
import { sendMessage } from '../broker/signal.js';
import log from '../utils/logger.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const FOLLOW_UP_DELAY_MS = 30 * 60 * 1000;
const MAX_FOLLOW_UPS = 3;

function plusMsIso(baseIso, ms) {
  return new Date(new Date(baseIso).getTime() + ms).toISOString();
}

function getSignalNumber(personId) {
  const household = getHousehold();
  return household.members?.[personId]?.identifiers?.signal || null;
}

function getName(personId) {
  const household = getHousehold();
  return household.members?.[personId]?.display_name || personId;
}

function deliverDueReminders(db, nowIso) {
  const due = db.prepare(
    `SELECT id,
            COALESCE(message, content) AS message,
            COALESCE(creator_id, requested_by) AS creator_id,
            COALESCE(target_id, target_person_id) AS target_id
     FROM reminders
     WHERE status = 'pending' AND fire_at <= ?`
  ).all(nowIso);

  for (const reminder of due) {
    const targetSignal = getSignalNumber(reminder.target_id);
    if (!targetSignal) {
      log.error('Reminder target missing Signal identifier', {
        reminder_id: reminder.id,
        target_id: reminder.target_id,
      });
      continue;
    }

    const delivered = sendMessage(targetSignal, `⏰ Reminder: ${reminder.message}`);
    if (!delivered) {
      log.error('Reminder delivery failed: signal transport unavailable', { reminder_id: reminder.id });
      continue;
    }

    const followUpAt = plusMsIso(nowIso, FOLLOW_UP_DELAY_MS);
    db.prepare(
      `UPDATE reminders
       SET status = 'fired',
           fired_at = ?,
           follow_up_at = ?,
           follow_up_count = 0
       WHERE id = ?`
    ).run(nowIso, followUpAt, reminder.id);

    if (reminder.creator_id !== reminder.target_id) {
      const creatorSignal = getSignalNumber(reminder.creator_id);
      if (creatorSignal) {
        sendMessage(
          creatorSignal,
          `📨 Reminder delivered to ${getName(reminder.target_id)}: ${reminder.message}`
        );
      }
    }
  }
}

function sendFollowUps(db, nowIso) {
  const dueFollowUps = db.prepare(
    `SELECT id,
            COALESCE(message, content) AS message,
            COALESCE(target_id, target_person_id) AS target_id,
            COALESCE(follow_up_count, 0) AS follow_up_count
     FROM reminders
     WHERE status = 'fired' AND follow_up_at <= ?`
  ).all(nowIso);

  for (const reminder of dueFollowUps) {
    if (reminder.follow_up_count >= MAX_FOLLOW_UPS) {
      db.prepare(
        `UPDATE reminders
         SET status = 'snoozed',
             follow_up_at = NULL
         WHERE id = ?`
      ).run(reminder.id);
      continue;
    }

    const targetSignal = getSignalNumber(reminder.target_id);
    if (!targetSignal) {
      log.error('Reminder follow-up failed: target missing Signal identifier', {
        reminder_id: reminder.id,
        target_id: reminder.target_id,
      });
      continue;
    }

    const delivered = sendMessage(
      targetSignal,
      `Did you get to this? → ${reminder.message}\nReply 'done', or tell me when to remind you again.`
    );
    if (!delivered) {
      log.error('Reminder follow-up failed: signal transport unavailable', { reminder_id: reminder.id });
      continue;
    }

    const nextCount = reminder.follow_up_count + 1;
    if (nextCount >= MAX_FOLLOW_UPS) {
      db.prepare(
        `UPDATE reminders
         SET status = 'snoozed',
             follow_up_count = ?,
             follow_up_at = NULL
         WHERE id = ?`
      ).run(nextCount, reminder.id);
    } else {
      const nextFollowUp = plusMsIso(nowIso, FOLLOW_UP_DELAY_MS);
      db.prepare(
        `UPDATE reminders
         SET follow_up_count = ?,
             follow_up_at = ?
         WHERE id = ?`
      ).run(nextCount, nextFollowUp, reminder.id);
    }
  }
}

function runReminderCycle() {
  const db = getDb();
  const nowIso = new Date().toISOString();
  try {
    deliverDueReminders(db, nowIso);
    sendFollowUps(db, nowIso);
  } catch (err) {
    log.error('Reminder scheduler cycle failed', { error: err.message });
  }
}

export function startReminderScheduler() {
  runReminderCycle();
  setInterval(runReminderCycle, CHECK_INTERVAL_MS);
}
