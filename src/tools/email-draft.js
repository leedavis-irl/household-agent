import { getHousehold } from '../utils/config.js';
import * as googleOAuth from '../utils/google-oauth.js';
import log from '../utils/logger.js';

function resolvePersonId(personInput, envelope) {
  const id = (personInput || envelope.person_id || envelope.person || '')
    .toString()
    .trim()
    .toLowerCase();
  if (!id) return null;
  const household = getHousehold();
  if (household.members[id]) return id;
  for (const [memberId, member] of Object.entries(household.members)) {
    if (member.display_name?.toLowerCase() === id) return memberId;
  }
  return null;
}

function checkEmailSendPermission(requestedPersonId, envelope) {
  const perms = envelope.permissions || [];
  const requesterId = (envelope.person_id || '').toLowerCase();
  if (requestedPersonId !== requesterId) return false;
  return perms.includes('email_send');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildRawMessage({ to, subject, body }) {
  const mimeMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');
  return Buffer.from(mimeMessage, 'utf-8').toString('base64url');
}

export const definition = {
  name: 'email_draft',
  description:
    "Save an email as a draft in a household member's Gmail account. The draft is not sent — they review and send it manually. Defaults to the person speaking.",
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description: "Whose Gmail to draft from (person id or display name). Default: the person speaking.",
      },
      to: {
        type: 'string',
        description: 'Recipient email address.',
      },
      subject: {
        type: 'string',
        description: 'Email subject line.',
      },
      body: {
        type: 'string',
        description: 'Plain text email body.',
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

export async function execute(input, envelope) {
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: 'Could not identify whose Gmail to draft from. Use person id (e.g. lee, steve).' };
  }

  if (!checkEmailSendPermission(personId, envelope)) {
    return {
      error: `Permission denied: ${envelope.person} cannot create email drafts as ${personId}.`,
    };
  }

  if (!googleOAuth.hasToken(personId)) {
    const household = getHousehold();
    const name = household.members[personId]?.display_name ?? personId;
    return {
      error: `I don't have access to ${name}'s Gmail yet. They need to authorize me first (run: node scripts/gmail-auth.js ${personId}).`,
    };
  }

  const to = (input?.to || '').trim();
  const subject = (input?.subject || '').trim();
  const body = (input?.body || '').trim();
  if (!to || !subject || !body) {
    return { error: 'to, subject, and body are required.' };
  }
  if (!isValidEmail(to)) {
    return { error: `Invalid recipient email address: ${to}` };
  }

  let client;
  try {
    client = await googleOAuth.getClient(personId);
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.message?.includes('expired') || err.message?.includes('revoked')) {
      return {
        error: `Gmail authorization has expired for ${personId}. They need to re-authorize (run: node scripts/gmail-auth.js ${personId}).`,
      };
    }
    log.error('Email draft: getClient failed', { personId, error: err.message });
    return { error: `Gmail error: ${err.message}` };
  }

  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const raw = buildRawMessage({ to, subject, body });
    const draftRes = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });
    const draftId = draftRes.data.id;
    return {
      drafted: true,
      to,
      subject,
      draftId,
      gmailLink: `https://mail.google.com/mail/#drafts/${draftId}`,
    };
  } catch (err) {
    if (err.code === 429 || err.message?.includes('rate')) {
      return { error: 'Gmail is rate-limiting me. Try again in a minute.' };
    }
    log.error('Email draft failed', { personId, error: err.message });
    return { error: `Gmail draft failed: ${err.message}` };
  }
}
