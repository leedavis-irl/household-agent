import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'findmy_locate',
  description:
    'Locate Apple devices and AirTag-tracked items via Find My. Queries Home Assistant device_tracker entities synced by FindMySync. Use to answer questions like "Where is my phone?", "Where are the AirTags?", or "Where is [person]\'s laptop?"',
  input_schema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description:
          'Optional name or keyword to filter devices (e.g., "phone", "lee", "airtag", "macbook"). If omitted, returns all tracked items.',
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

function formatLocation(entity) {
  const attrs = entity.attributes || {};
  const result = {
    entity_id: entity.entity_id,
    name: attrs.friendly_name || entity.entity_id,
    state: entity.state,
    last_updated: entity.last_updated || entity.last_changed,
  };

  if (attrs.latitude != null && attrs.longitude != null) {
    result.latitude = attrs.latitude;
    result.longitude = attrs.longitude;
  }

  // FindMySync may provide a formatted address
  if (attrs.address) {
    result.address = attrs.address;
  }

  if (attrs.battery_level != null) {
    result.battery_level = attrs.battery_level;
  }

  if (attrs.source_type) {
    result.source_type = attrs.source_type;
  }

  return result;
}

export async function execute(input) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  try {
    const allStates = await haFetch('/api/states');
    const trackers = allStates.filter((e) => e.entity_id.startsWith('device_tracker.'));

    if (trackers.length === 0) {
      return {
        error:
          'No device_tracker entities found in Home Assistant. FindMySync may not be running or configured. ' +
          'Set up FindMySync on a household Mac and point it at this Home Assistant instance.',
      };
    }

    let filtered = trackers;
    if (input.keyword) {
      const kw = input.keyword.toLowerCase();
      filtered = trackers.filter(
        (e) =>
          e.entity_id.toLowerCase().includes(kw) ||
          (e.attributes?.friendly_name || '').toLowerCase().includes(kw)
      );
    }

    if (filtered.length === 0) {
      return {
        message: `No tracked devices matched "${input.keyword}". Available trackers: ${trackers.map((e) => e.attributes?.friendly_name || e.entity_id).join(', ')}`,
        results: [],
      };
    }

    return {
      results: filtered.map(formatLocation),
      total: filtered.length,
    };
  } catch (err) {
    log.error('Find My locate failed', { error: err.message });
    return { error: `Find My locate failed: ${err.message}` };
  }
}
