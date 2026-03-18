import log from '../utils/logger.js';
import { getHousehold } from '../utils/config.js';
import { getEntityArea } from '../utils/ha-areas.js';

const HA_URL = process.env.HA_URL;
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

function toFriendlyArea(areaId) {
  return (areaId || 'unknown area')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function ownerDisplayNames(ownerIds, household) {
  return ownerIds.map((id) => household.members[id]?.display_name || id);
}

async function checkAreaPermission(entityId, envelope) {
  const permissions = envelope.permissions || [];
  if (permissions.includes('ha_all')) {
    return { allowed: true, areaId: null, reason: null };
  }

  const areaId = await getEntityArea(entityId);
  if (!areaId) {
    return { allowed: false, areaId: null, reason: 'unknown_area' };
  }

  const household = getHousehold();
  const haAreas = household.ha_areas || {};
  const common = haAreas.common;
  const personal = haAreas.personal || {};

  if (common === 'all') {
    return { allowed: permissions.includes('ha_common'), areaId, reason: 'common' };
  }

  if (Array.isArray(common) && common.includes(areaId)) {
    return { allowed: permissions.includes('ha_common'), areaId, reason: 'common' };
  }

  if (Array.isArray(personal[areaId])) {
    const owners = personal[areaId];
    const actor = (envelope.person_id || '').toLowerCase();
    const allowed = permissions.includes('ha_office') && owners.includes(actor);
    return { allowed, areaId, reason: allowed ? null : 'personal', owners };
  }

  return { allowed: false, areaId, reason: 'unmapped' };
}

export async function execute(input, envelope) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  // Check area-based permission
  const areaCheck = await checkAreaPermission(input.entity_id, envelope);
  if (!areaCheck.allowed) {
    if (areaCheck.reason === 'personal' && Array.isArray(areaCheck.owners)) {
      const household = getHousehold();
      const owners = ownerDisplayNames(areaCheck.owners, household).join(', ');
      return {
        error: `Permission denied: ${envelope.person} cannot control devices in ${toFriendlyArea(areaCheck.areaId)}. That's a personal space belonging to ${owners}.`,
      };
    }

    return {
      error: `Permission denied: ${envelope.person} cannot control devices in ${toFriendlyArea(areaCheck.areaId)}.`,
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
