import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL || 'http://100.127.233.50:8123';
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_control',
  description:
    'Send commands to Home Assistant devices — turn lights on/off, set thermostat temperature, lock/unlock doors, etc. Permission-gated: the agent checks the person\'s permissions before executing.',
  input_schema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'The HA service domain (e.g., "light", "switch", "climate", "lock", "cover")',
      },
      service: {
        type: 'string',
        description: 'The service to call (e.g., "turn_on", "turn_off", "lock", "unlock", "set_temperature")',
      },
      entity_id: {
        type: 'string',
        description: 'The target entity ID (e.g., "light.kitchen", "lock.front_door")',
      },
      service_data: {
        type: 'object',
        description: 'Additional service data (e.g., {"brightness": 128} for lights, {"temperature": 72} for climate)',
      },
    },
    required: ['domain', 'service', 'entity_id'],
  },
};

// Map entity areas to permission requirements
// Entities containing these substrings require the corresponding permission
const AREA_PERMISSIONS = {
  office: 'ha_office',
  bedroom: 'ha_office', // personal space, same gating
  common: 'ha_common',
  kitchen: 'ha_common',
  living: 'ha_common',
  bathroom: 'ha_common',
  garage: 'ha_common',
  front: 'ha_common',
  back: 'ha_common',
  porch: 'ha_common',
};

function checkAreaPermission(entityId, permissions) {
  // ha_all grants everything
  if (permissions.includes('ha_all')) return true;

  const entityLower = entityId.toLowerCase();
  for (const [area, requiredPerm] of Object.entries(AREA_PERMISSIONS)) {
    if (entityLower.includes(area)) {
      return permissions.includes(requiredPerm);
    }
  }

  // Unknown area — require ha_all
  return permissions.includes('ha_all');
}

export async function execute(input, envelope) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  // Check area-based permission
  if (!checkAreaPermission(input.entity_id, envelope.permissions)) {
    return {
      error: `Permission denied: ${envelope.person} cannot control ${input.entity_id}. You may not have access to devices in that area.`,
    };
  }

  try {
    const body = {
      entity_id: input.entity_id,
      ...(input.service_data || {}),
    };

    const res = await fetch(`${HA_URL}/api/services/${input.domain}/${input.service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HA service call failed (${res.status}): ${text}`);
    }

    log.info('HA control executed', {
      person: envelope.person,
      domain: input.domain,
      service: input.service,
      entity_id: input.entity_id,
    });

    return {
      success: true,
      message: `Called ${input.domain}.${input.service} on ${input.entity_id}`,
    };
  } catch (err) {
    log.error('HA control failed', { error: err.message });
    return { error: `Home Assistant control failed: ${err.message}` };
  }
}
