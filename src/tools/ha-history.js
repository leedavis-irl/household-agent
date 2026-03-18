import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL || 'http://100.127.233.50:8123';
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_history',
  description:
    'Query Home Assistant for historical state changes of an entity. Returns state transitions over a time period — useful for questions like "when did the front door last open?" or "what was the temperature overnight?"',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'The entity to get history for (e.g., "sensor.living_room_temperature", "binary_sensor.front_door")',
      },
      hours: {
        type: 'number',
        description: 'How many hours of history to retrieve (default: 24, max: 168)',
      },
    },
    required: ['entity_id'],
  },
};

export async function execute(input) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  const hours = Math.min(input.hours || 24, 168);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(
      `${HA_URL}/api/history/period/${since}?filter_entity_id=${input.entity_id}&minimal_response`,
      {
        headers: {
          Authorization: `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HA history API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    // HA returns array of arrays; first array is our entity
    const entityHistory = (data[0] || []).map((entry) => ({
      state: entry.state,
      last_changed: entry.last_changed,
    }));

    // Cap to last 50 transitions to avoid context bloat
    const capped = entityHistory.slice(-50);

    return {
      entity_id: input.entity_id,
      hours,
      transitions: capped,
      total: entityHistory.length,
      message: entityHistory.length > 50
        ? `Showing last 50 of ${entityHistory.length} transitions. Narrow the time range for more detail.`
        : undefined,
    };
  } catch (err) {
    log.error('HA history query failed', { entity_id: input.entity_id, error: err.message });
    return { error: `Home Assistant history query failed: ${err.message}` };
  }
}
