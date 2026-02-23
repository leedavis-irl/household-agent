import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL || 'http://100.127.233.50:8123';
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_query',
  description:
    'Query Home Assistant for device and entity states. Use this to answer questions like "is anyone home?", "what\'s the temperature?", "are the lights on in the kitchen?", "is the front door locked?"',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description:
          'Specific HA entity ID to query (e.g., "light.kitchen", "sensor.living_room_temperature", "person.lee"). If omitted, returns all states matching the domain.',
      },
      domain: {
        type: 'string',
        description:
          'Filter by entity domain (e.g., "light", "sensor", "person", "lock", "climate"). Use this for broad queries like "show me all lights".',
      },
    },
  },
};

async function haFetch(path) {
  const res = await fetch(`${HA_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant API error (${res.status}): ${text}`);
  }
  return res.json();
}

function summarizeEntity(entity) {
  return {
    entity_id: entity.entity_id,
    state: entity.state,
    friendly_name: entity.attributes?.friendly_name || entity.entity_id,
    last_changed: entity.last_changed,
  };
}

export async function execute(input) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  try {
    if (input.entity_id) {
      const entity = await haFetch(`/api/states/${input.entity_id}`);
      return { results: [summarizeEntity(entity)] };
    }

    const allStates = await haFetch('/api/states');

    let filtered = allStates;
    if (input.domain) {
      filtered = allStates.filter((e) => e.entity_id.startsWith(`${input.domain}.`));
    }

    // Cap results to avoid overwhelming the context
    const results = filtered.slice(0, 50).map(summarizeEntity);
    return {
      results,
      total: filtered.length,
      message: filtered.length > 50 ? `Showing 50 of ${filtered.length} entities. Use a more specific query.` : undefined,
    };
  } catch (err) {
    log.error('HA state query failed', { error: err.message });
    return { error: `Home Assistant query failed: ${err.message}` };
  }
}
