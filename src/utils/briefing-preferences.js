import { getDb } from './db.js';

/**
 * Get the effective briefing config for a person.
 * Resolution order:
 * 1. SQLite briefing_preferences table
 * 2. household.json member.briefing
 * 3. Not subscribed (null)
 *
 * @param {string} personId
 * @param {object} [householdMember] - member object from household.json
 * @returns {{ enabled: boolean, deliveryHour: number } | null}
 */
export function getEffectiveBriefingConfig(personId, householdMember) {
  const db = getDb();
  const row = db.prepare(
    'SELECT enabled, delivery_hour FROM briefing_preferences WHERE person_id = ?'
  ).get(personId);

  if (row) {
    const enabled = row.enabled === 1;
    // delivery_hour from SQLite, fall back to household.json, fall back to 9
    const deliveryHour = row.delivery_hour != null
      ? row.delivery_hour
      : (householdMember?.briefing?.delivery_hour ?? 9);
    return { enabled, deliveryHour };
  }

  // Fall back to household.json
  const briefing = householdMember?.briefing;
  if (briefing && briefing.enabled != null) {
    return {
      enabled: !!briefing.enabled,
      deliveryHour: Number(briefing.delivery_hour) || 9,
    };
  }

  return null;
}

/**
 * Upsert a briefing preference for a person.
 *
 * @param {string} personId
 * @param {boolean} enabled
 * @param {number|null} deliveryHour - 0-23 or null to keep existing
 * @param {string} updatedBy
 */
export function setBriefingPreference(personId, enabled, deliveryHour, updatedBy) {
  const db = getDb();

  if (deliveryHour != null) {
    db.prepare(`
      INSERT INTO briefing_preferences (person_id, enabled, delivery_hour, updated_by, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(person_id) DO UPDATE SET
        enabled = excluded.enabled,
        delivery_hour = excluded.delivery_hour,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `).run(personId, enabled ? 1 : 0, deliveryHour, updatedBy);
  } else {
    // Keep existing delivery_hour
    db.prepare(`
      INSERT INTO briefing_preferences (person_id, enabled, delivery_hour, updated_by, updated_at)
      VALUES (?, ?, NULL, ?, datetime('now'))
      ON CONFLICT(person_id) DO UPDATE SET
        enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `).run(personId, enabled ? 1 : 0, updatedBy);
  }
}
