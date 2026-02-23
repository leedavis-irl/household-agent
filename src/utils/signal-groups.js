import { getDb } from './db.js';

/**
 * Register a Signal group so message_send can look it up by name.
 * Idempotent: updates group_name if the group was already seen.
 */
export function registerGroup(groupId, groupName) {
  const db = getDb();
  const name = (groupName || 'Unknown group').trim();
  const existing = db.prepare('SELECT 1 FROM signal_groups WHERE group_id = ?').get(groupId);
  if (existing) {
    db.prepare('UPDATE signal_groups SET group_name = ? WHERE group_id = ?').run(name, groupId);
  } else {
    db.prepare('INSERT INTO signal_groups (group_id, group_name) VALUES (?, ?)').run(groupId, name);
  }
}

/**
 * Look up a group by name (case-insensitive). Returns { group_id, group_name } or null.
 */
export function getGroupByName(name) {
  if (!name || typeof name !== 'string') return null;
  const db = getDb();
  const row = db.prepare(
    'SELECT group_id, group_name FROM signal_groups WHERE LOWER(TRIM(group_name)) = LOWER(?)'
  ).get(name.trim());
  return row ?? null;
}

/**
 * Look up a group by ID. Returns { group_id, group_name } or null.
 */
export function getGroupById(groupId) {
  if (!groupId) return null;
  const db = getDb();
  const row = db.prepare(
    'SELECT group_id, group_name FROM signal_groups WHERE group_id = ?'
  ).get(groupId);
  return row ?? null;
}
