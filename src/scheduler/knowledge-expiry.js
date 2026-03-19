import { getDb } from '../utils/db.js';
import log from '../utils/logger.js';

// Run once per day
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function deleteExpiredKnowledge(db, nowIso) {
  const result = db
    .prepare('DELETE FROM knowledge WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .run(nowIso);

  if (result.changes > 0) {
    log.info('Knowledge expiry: deleted expired entries', { count: result.changes });
  }
}

function runExpiryCycle() {
  const db = getDb();
  const nowIso = new Date().toISOString();
  try {
    deleteExpiredKnowledge(db, nowIso);
  } catch (err) {
    log.error('Knowledge expiry cycle failed', { error: err.message });
  }
}

export function startKnowledgeExpiryScheduler() {
  runExpiryCycle();
  setInterval(runExpiryCycle, CHECK_INTERVAL_MS);
}
