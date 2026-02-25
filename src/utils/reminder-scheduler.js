import { getDb } from './db.js';
import { getHousehold } from './config.js';
import { sendMessage } from '../broker/signal.js';
import log from './logger.js';

const CHECK_INTERVAL_MS = 60 * 1000;
let lastCleanupDate = null;

function runCleanupIfNeeded(nowIso) {
  const today = nowIso.slice(0, 10);
  if (lastCleanupDate === today) return;

  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM reminders WHERE status = 'fired' AND fired_at < ?`).run(sevenDaysAgo);
  db.prepare(`DELETE FROM reminders WHERE status = 'cancelled' AND created_at < ?`).run(oneDayAgo);
  lastCleanupDate = today;
}

function runReminderCycle() {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const due = db.prepare(
    `SELECT id, content, target_person_id, requested_by
     FROM reminders
     WHERE status = 'pending' AND fire_at <= ?`
  ).all(nowIso);

  const household = getHousehold();
  let fired = 0;
  let failed = 0;

  for (const reminder of due) {
    const target = household.members[reminder.target_person_id];
    const signalNumber = target?.identifiers?.signal;
    if (!target || !signalNumber) {
      log.error('Reminder delivery failed: target missing Signal configuration', {
        reminder_id: reminder.id,
        target_person_id: reminder.target_person_id,
      });
      failed += 1;
      continue;
    }

    const requester = household.members[reminder.requested_by];
    const requesterName = requester?.display_name || reminder.requested_by;
    const isSelf = reminder.requested_by === reminder.target_person_id;
    const text = isSelf
      ? `⏰ Reminder: ${reminder.content}`
      : `⏰ Reminder from ${requesterName}: ${reminder.content}`;

    const delivered = sendMessage(signalNumber, text);
    if (!delivered) {
      log.error('Reminder delivery failed: Signal unavailable', { reminder_id: reminder.id });
      failed += 1;
      continue;
    }

    db.prepare(`UPDATE reminders SET status = 'fired', fired_at = ? WHERE id = ?`).run(nowIso, reminder.id);
    fired += 1;
  }

  runCleanupIfNeeded(nowIso);
  log.info('Reminders checked', { due: due.length, fired, failed });
}

export function startReminderScheduler() {
  runReminderCycle();
  setInterval(runReminderCycle, CHECK_INTERVAL_MS);
}
