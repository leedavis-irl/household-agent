import { getDb } from '../utils/db.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'briefing_preferences',
  description:
    'View or update morning briefing preferences for the current user. Can enable/disable the daily briefing or change the delivery hour.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'enable', 'disable', 'set_hour'],
        description: 'What to do: "get" shows current settings, "enable"/"disable" toggles the briefing, "set_hour" changes delivery time',
      },
      delivery_hour: {
        type: 'number',
        description: 'Hour in 24h Pacific time (0-23) for briefing delivery. Only used with action "set_hour" or "enable".',
      },
    },
    required: ['action'],
  },
};

function getPrefs(db, personId) {
  return db.prepare(
    'SELECT enabled, delivery_hour FROM briefing_preferences WHERE person_id = ?'
  ).get(personId) || null;
}

function upsertPrefs(db, personId, enabled, deliveryHour) {
  db.prepare(
    `INSERT INTO briefing_preferences (person_id, enabled, delivery_hour, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(person_id) DO UPDATE SET
       enabled = excluded.enabled,
       delivery_hour = excluded.delivery_hour,
       updated_at = datetime('now')`
  ).run(personId, enabled ? 1 : 0, deliveryHour);
}

export async function execute(input, envelope) {
  const personId = envelope.person_id;
  if (!personId) {
    return { error: 'Cannot determine your identity' };
  }

  try {
    const db = getDb();
    const action = input.action;

    if (action === 'get') {
      const prefs = getPrefs(db, personId);
      if (!prefs) {
        return {
          person_id: personId,
          source: 'default',
          enabled: false,
          delivery_hour: null,
          message: 'No briefing preferences set. Briefing uses household.json defaults (if configured).',
        };
      }
      return {
        person_id: personId,
        source: 'user_preference',
        enabled: !!prefs.enabled,
        delivery_hour: prefs.delivery_hour,
      };
    }

    if (action === 'disable') {
      const existing = getPrefs(db, personId);
      const hour = existing?.delivery_hour ?? 9;
      upsertPrefs(db, personId, false, hour);
      log.info('Briefing disabled', { person_id: personId });
      return {
        success: true,
        enabled: false,
        message: `Morning briefing disabled for ${envelope.person}. Say "turn on my briefing" to re-enable.`,
      };
    }

    if (action === 'enable') {
      const hour = (input.delivery_hour != null && input.delivery_hour >= 0 && input.delivery_hour <= 23)
        ? input.delivery_hour
        : (getPrefs(db, personId)?.delivery_hour ?? 9);
      upsertPrefs(db, personId, true, hour);
      log.info('Briefing enabled', { person_id: personId, delivery_hour: hour });
      return {
        success: true,
        enabled: true,
        delivery_hour: hour,
        message: `Morning briefing enabled for ${envelope.person} at ${hour}:00 Pacific.`,
      };
    }

    if (action === 'set_hour') {
      const hour = input.delivery_hour;
      if (hour == null || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
        return { error: 'delivery_hour must be an integer 0-23' };
      }
      const existing = getPrefs(db, personId);
      const enabled = existing?.enabled ?? true;
      upsertPrefs(db, personId, enabled, hour);
      log.info('Briefing hour updated', { person_id: personId, delivery_hour: hour });
      return {
        success: true,
        enabled: !!enabled,
        delivery_hour: hour,
        message: `Briefing delivery time set to ${hour}:00 Pacific for ${envelope.person}.`,
      };
    }

    return { error: `Unknown action: ${action}. Use get, enable, disable, or set_hour.` };
  } catch (err) {
    log.error('Briefing preferences failed', { person_id: personId, error: err.message });
    return { error: `Failed to update briefing preferences: ${err.message}` };
  }
}
