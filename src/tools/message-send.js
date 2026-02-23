import { sendMessage, sendGroupMessage } from '../broker/signal.js';
import { getHousehold } from '../utils/config.js';
import { getGroupByName } from '../utils/signal-groups.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'message_send',
  description:
    'Send a Signal message to a household member or a Signal group. Use for: relaying messages on someone\'s behalf ("tell Steve dinner\'s at 7"), proactive outreach from Iji, or household announcements. Recipient can be a member id (e.g. "steve", "lee") or a group name (e.g. "Avalon Logistics"). When relaying, use from_person so the recipient sees who the message is from.',
  input_schema: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description:
          'Who receives the message: a household member id (e.g. "steve", "lee") or a Signal group name (e.g. "Avalon Logistics").',
      },
      message: {
        type: 'string',
        description: 'The message text to send.',
      },
      from_person: {
        type: 'string',
        description:
          'Optional. When relaying on someone\'s behalf, the person id or display name (e.g. "lee"). The recipient will see "From Lee: &lt;message&gt;".',
      },
    },
    required: ['recipient', 'message'],
  },
};

function resolveDisplayName(fromPerson) {
  if (!fromPerson || typeof fromPerson !== 'string') return null;
  const household = getHousehold();
  const id = fromPerson.trim().toLowerCase();
  const member = household.members[id];
  if (member) return member.display_name;
  for (const m of Object.values(household.members)) {
    if (m.display_name?.toLowerCase() === id) return m.display_name;
  }
  return fromPerson.trim();
}

export async function execute(input, envelope) {
  const recipient = (input.recipient || '').trim();
  const message = (input.message || '').trim();

  if (!recipient) return { error: 'recipient is required.' };
  if (!message) return { error: 'message is required.' };

  let formattedMessage = message;
  if (input.from_person) {
    const fromName = resolveDisplayName(input.from_person);
    formattedMessage = `From ${fromName}: ${message}`;
  }

  const household = getHousehold();

  // Try group by name first (case-insensitive)
  const group = getGroupByName(recipient);
  if (group) {
    sendGroupMessage(group.group_id, formattedMessage);
    log.info('message_send: group', {
      groupName: group.group_name,
      from: envelope.person,
      length: formattedMessage.length,
    });
    return { sent: true, to: `group "${group.group_name}"` };
  }

  // Resolve as household member
  const memberId = recipient.toLowerCase();
  const member = household.members[memberId];
  if (!member) {
    return { error: `Unknown recipient "${recipient}". Use a member id (e.g. steve, lee) or a registered group name.` };
  }

  const signalNumber = member.identifiers?.signal;
  if (!signalNumber) {
    return { error: `No Signal number configured for ${member.display_name}.` };
  }

  sendMessage(signalNumber, formattedMessage);
  log.info('message_send: DM', {
    to: member.display_name,
    from: envelope.person,
    length: formattedMessage.length,
  });
  return { sent: true, to: member.display_name };
}
