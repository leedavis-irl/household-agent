import log from '../utils/logger.js';

const HA_URL = process.env.HA_URL || 'http://100.127.233.50:8123';
const HA_TOKEN = process.env.HA_TOKEN;

export const definition = {
  name: 'ha_notify',
  description:
    'Send a notification through Home Assistant notify services — push notifications to phones, display messages on smart displays, or trigger TTS announcements.',
  input_schema: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description: 'The notify service name (e.g., "mobile_app_lee_phone", "notify"). Use "notify" for the default notification group.',
      },
      message: {
        type: 'string',
        description: 'The notification message text',
      },
      title: {
        type: 'string',
        description: 'Optional notification title',
      },
      data: {
        type: 'object',
        description: 'Optional platform-specific data (e.g., {"push": {"sound": "default"}} for mobile)',
      },
    },
    required: ['service', 'message'],
  },
};

export async function execute(input, envelope) {
  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  try {
    const body = {
      message: input.message,
    };
    if (input.title) body.title = input.title;
    if (input.data) body.data = input.data;

    const res = await fetch(`${HA_URL}/api/services/notify/${input.service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HA notify failed (${res.status}): ${text}`);
    }

    log.info('HA notification sent', {
      person: envelope.person,
      service: input.service,
      title: input.title || '(no title)',
    });

    return {
      success: true,
      message: `Notification sent via notify.${input.service}`,
    };
  } catch (err) {
    log.error('HA notify failed', { service: input.service, error: err.message });
    return { error: `Home Assistant notification failed: ${err.message}` };
  }
}
