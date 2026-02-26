import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendSms, isConfigured } from '../broker/twilio.js';
import { getHousehold } from '../utils/config.js';
import log from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTACTS_PATH = join(__dirname, '../../config/contacts.json');

export const definition = {
  name: 'sms_send',
  description:
    'Send an SMS text message to an external contact, household member, or raw phone number via Twilio.',
  input_schema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description:
          'Recipient contact id, household member id/display name, or raw phone number in E.164 format (+1XXXXXXXXXX).',
      },
      message: {
        type: 'string',
        description: 'Text message to send.',
      },
      from_person: {
        type: 'string',
        description:
          'Optional. Relay on someone else\'s behalf by prefixing message with "From <Name>: ".',
      },
    },
    required: ['to', 'message'],
  },
};

function loadContacts() {
  if (!existsSync(CONTACTS_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONTACTS_PATH, 'utf-8'));
    return parsed?.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {};
  } catch {
    return {};
  }
}

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

function isLikelyPhoneNumber(value) {
  return /^\+\d{8,15}$/.test(value);
}

function resolveRecipient(toInput) {
  const to = (toInput || '').trim();
  const key = to.toLowerCase();

  const contacts = loadContacts();
  for (const [contactId, contact] of Object.entries(contacts)) {
    if (contactId.toLowerCase() === key) {
      return {
        number: contact.phone,
        name: contact.display_name || contactId,
      };
    }
  }

  const household = getHousehold();
  if (household.members[key]?.identifiers?.signal) {
    return {
      number: household.members[key].identifiers.signal,
      name: household.members[key].display_name || key,
    };
  }

  for (const member of Object.values(household.members)) {
    if (member.display_name?.toLowerCase() === key && member.identifiers?.signal) {
      return {
        number: member.identifiers.signal,
        name: member.display_name,
      };
    }
  }

  if (to.startsWith('+')) {
    return {
      number: to,
      name: to,
    };
  }

  return null;
}

function preview(text) {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export async function execute(input, envelope) {
  const to = (input?.to || '').trim();
  const message = (input?.message || '').trim();
  if (!to) return { error: 'to is required.' };
  if (!message) return { error: 'message is required.' };

  if (!isConfigured()) {
    return { error: "SMS isn't set up yet. Lee needs to add Twilio credentials." };
  }

  const resolved = resolveRecipient(to);
  if (!resolved) {
    return {
      error: `I don't have a contact named "${to}". You can give me their phone number directly, or ask Lee to add them to the contacts list.`,
    };
  }

  if (!isLikelyPhoneNumber(resolved.number)) {
    return { error: "That doesn't look like a valid phone number. Use format: +1XXXXXXXXXX" };
  }

  let formattedMessage = message;
  if (input?.from_person) {
    const fromName = resolveDisplayName(input.from_person);
    formattedMessage = `From ${fromName}: ${message}`;
  }

  const result = await sendSms(resolved.number, formattedMessage);
  if (!result.success) {
    return { error: `SMS send failed: ${result.error}` };
  }

  log.info('sms_send sent', {
    to: resolved.number,
    to_name: resolved.name,
    from: envelope.person,
    sid: result.sid,
  });

  return {
    sent: true,
    to: resolved.number,
    to_name: resolved.name,
    message_preview: preview(formattedMessage),
  };
}
