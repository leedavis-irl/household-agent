import { getEffectiveBriefingConfig } from '../utils/briefing-preferences.js';
import { getHousehold } from '../utils/config.js';
import { getDb } from '../utils/db.js';

export const definition = {
  name: 'briefing_status',
  description:
    'Check your current morning briefing subscription status and delivery time.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export async function execute(_input, envelope) {
  const personId = envelope.person_id;
  if (!personId) {
    return { error: 'Could not identify who is making this request.' };
  }

  const household = getHousehold();
  const member = household.members?.[personId];
  const effective = getEffectiveBriefingConfig(personId, member);

  // Determine source
  const db = getDb();
  const row = db.prepare(
    'SELECT person_id FROM briefing_preferences WHERE person_id = ?'
  ).get(personId);
  const source = row ? 'preference' : 'default';

  if (!effective) {
    return { subscribed: false, source: 'default' };
  }

  return {
    subscribed: effective.enabled,
    delivery_hour: effective.deliveryHour,
    source,
  };
}
