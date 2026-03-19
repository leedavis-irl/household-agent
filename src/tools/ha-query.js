import log from '../utils/logger.js';
import { getAreaEntityMap, getAreas } from '../utils/ha-areas.js';

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_query',
  description:
    'Query Home Assistant for device and entity states. You can:\n- Query a specific entity by ID\n- Filter by domain (e.g., all lights, all sensors)\n- Filter by area/room (e.g., "workshop", "living_room") — use list_areas=true first to see available areas\n- Combine domain + area filters (e.g., all lights in the workshop)',
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
      area: {
        type: 'string',
        description:
          'HA area ID to filter by (e.g., "workshop", "living_room", "steve_s_office"). Returns only entities in that area.',
      },
      list_areas: {
        type: 'boolean',
        description:
          'If true, returns the list of all HA areas. Use this to discover what rooms/zones exist.',
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
  const lastChanged = entity.last_changed;
  const data_age_minutes = lastChanged
    ? Math.floor((Date.now() - new Date(lastChanged).getTime()) / (1000 * 60))
    : null;
  return {
    entity_id: entity.entity_id,
    state: entity.state,
    friendly_name: entity.attributes?.friendly_name || entity.entity_id,
    last_changed: lastChanged,
    data_age_minutes,
  };
}

export async function execute(input) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  try {
    if (input.list_areas) {
      const areas = await getAreas();
      return { areas };
    }

    if (input.entity_id) {
      const entity = await haFetch(`/api/states/${input.entity_id}`);
      return { results: [summarizeEntity(entity)] };
    }

    const allStates = await haFetch('/api/states');

    if (input.area) {
      const areaId = input.area.toString().trim();
      const areaEntityMap = await getAreaEntityMap();
      const entitySet = new Set(areaEntityMap.get(areaId) || []);
      let filtered = allStates.filter((e) => entitySet.has(e.entity_id));
      if (input.domain) {
        filtered = filtered.filter((e) => e.entity_id.startsWith(`${input.domain}.`));
      }
      return {
        area: areaId,
        results: filtered.map(summarizeEntity),
        total: filtered.length,
      };
    }

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
