import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_scene',
  description:
    'Activate a Home Assistant scene or trigger an automation. Scenes set multiple devices to predefined states (e.g., "movie night", "bedtime"). Automations can be triggered on demand.',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'The scene or automation entity ID (e.g., "scene.movie_night", "automation.porch_lights_at_sunset")',
      },
    },
    required: ['entity_id'],
  },
};

export async function execute(input, envelope) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  const entityId = input.entity_id;
  const isScene = entityId.startsWith('scene.');
  const isAutomation = entityId.startsWith('automation.');

  if (!isScene && !isAutomation) {
    return { error: `Expected a scene.* or automation.* entity, got: ${entityId}` };
  }

  const domain = isScene ? 'scene' : 'automation';
  const service = isScene ? 'turn_on' : 'trigger';

  try {
    const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HA service call failed (${res.status}): ${text}`);
    }

    log.info('HA scene/automation activated', {
      person: envelope.person,
      entity_id: entityId,
      type: domain,
    });

    return {
      success: true,
      message: isScene
        ? `Activated scene ${entityId}`
        : `Triggered automation ${entityId}`,
    };
  } catch (err) {
    log.error('HA scene/automation failed', { entity_id: entityId, error: err.message });
    return { error: `Home Assistant ${domain} activation failed: ${err.message}` };
  }
}
