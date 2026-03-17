import { setBriefingPreference, getEffectiveBriefingConfig } from '../utils/briefing-preferences.js';
import { getHousehold } from '../utils/config.js';

export const definition = {
  name: 'briefing_subscribe',
  description:
    'Subscribe or unsubscribe from the daily morning briefing, and optionally change delivery time.',
  input_schema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: 'true to subscribe, false to unsubscribe',
      },
      delivery_hour: {
        type: 'integer',
        description:
          'Hour to receive briefing (0-23, Pacific time). Optional — keeps current setting if omitted.',
      },
    },
    required: ['enabled'],
  },
};

export async function execute(input, envelope) {
  const personId = envelope.person_id;
  if (!personId) {
    return { error: 'Could not identify who is making this request.' };
  }

  const enabled = !!input.enabled;
  const deliveryHour = input.delivery_hour != null ? Number(input.delivery_hour) : null;

  if (deliveryHour != null && (!Number.isInteger(deliveryHour) || deliveryHour < 0 || deliveryHour > 23)) {
    return { error: 'delivery_hour must be an integer between 0 and 23.' };
  }

  setBriefingPreference(personId, enabled, deliveryHour, personId);

  if (!enabled) {
    return { status: 'unsubscribed' };
  }

  // Resolve effective delivery hour for confirmation
  const household = getHousehold();
  const member = household.members?.[personId];
  const effective = getEffectiveBriefingConfig(personId, member);

  return {
    status: 'subscribed',
    delivery_hour: effective?.deliveryHour ?? 9,
  };
}
