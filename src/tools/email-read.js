import { getHousehold } from '../utils/config.js';
import * as googleOAuth from '../utils/google-oauth.js';
import log from '../utils/logger.js';

const MAX_BODY_CHARS = 4000;

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

function checkEmailPermission(requestedPersonId, envelope) {
  const requesterId = (envelope.person_id || '').toLowerCase();
  if (requestedPersonId === requesterId) {
    return envelope.permissions?.includes('email_own') ?? false;
  }
  return envelope.permissions?.includes('email_all') ?? false;
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBody(data, encoding) {
  if (!data) return '';
  try {
    const buf = Buffer.from(data, encoding === 'base64url' ? 'base64url' : 'base64');
    return buf.toString('utf-8');
  } catch {
    return '';
  }
}

function extractTextFromPart(part) {
  if (!part) return null;
  const mimeType = (part.mimeType || '').toLowerCase();
  if (mimeType === 'text/plain') {
    const body = part.body?.data;
    return body ? decodeBody(body, part.body?.encoding || 'base64url') : null;
  }
  if (mimeType === 'text/html') {
    const body = part.body?.data;
    const html = body ? decodeBody(body, part.body?.encoding || 'base64url') : '';
    return html ? stripHtml(html) : null;
  }
  return null;
}

function walkParts(payload, preferPlain = true) {
  let plain = null;
  let html = null;
  const attachments = [];

  function walk(p) {
    if (!p) return;
    const mime = (p.mimeType || '').toLowerCase();
    if (p.filename && p.body?.size) {
      attachments.push({ filename: p.filename, size: p.body.size });
      return;
    }
    if (mime === 'text/plain') plain = extractTextFromPart(p);
    else if (mime === 'text/html') html = extractTextFromPart(p);
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  }

  if (payload.parts) {
    payload.parts.forEach(walk);
  } else if (payload.body?.data) {
    const mime = (payload.mimeType || '').toLowerCase();
    if (mime === 'text/plain') plain = decodeBody(payload.body.data, payload.body.encoding || 'base64url');
    else if (mime === 'text/html') html = stripHtml(decodeBody(payload.body.data, payload.body.encoding || 'base64url'));
  }

  if (preferPlain && plain) return { body: plain, attachments };
  if (html) return { body: stripHtml(html), attachments };
  return { body: plain || '', attachments };
}

function headersMap(headers) {
  const map = {};
  for (const h of headers || []) {
    if (h.name) map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

function formatMessage(msg) {
  const payload = msg.payload || {};
  const headers = headersMap(payload.headers);
  const { body, attachments } = walkParts(payload);
  let bodyText = body || '';
  let truncated = false;
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText = bodyText.slice(0, MAX_BODY_CHARS) + '\n\n[Message truncated. Full message is ' + body.length + ' characters.]';
    truncated = true;
  }
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headers.from ?? '',
    to: headers.to ?? '',
    cc: headers.cc ?? '',
    subject: headers.subject ?? '',
    date: headers.date ?? '',
    body: bodyText,
    attachments: attachments.length ? attachments : undefined,
  };
}

export const definition = {
  name: 'email_read',
  description:
    "Read the full content of a specific email or thread. Use email_search first to find the message ID.",
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description: "Whose email to read (person id or display name).",
      },
      message_id: {
        type: 'string',
        description: 'The message ID from email_search results.',
      },
      thread: {
        type: 'boolean',
        description: 'If true, read the full thread (default: false). Uses threadId from search if message_id is in a thread.',
      },
    },
  },
};

export async function execute(input, envelope) {
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: 'Could not identify whose email to read. Use person id (e.g. lee, steve).' };
  }

  if (!checkEmailPermission(personId, envelope)) {
    return {
      error: `Permission denied: ${envelope.person} cannot read ${personId}'s email.`,
    };
  }

  if (!googleOAuth.hasToken(personId)) {
    const household = getHousehold();
    const name = household.members[personId]?.display_name ?? personId;
    return {
      error: `I don't have access to ${name}'s Gmail yet. They need to authorize me first (run: node scripts/gmail-auth.js ${personId}).`,
    };
  }

  const messageId = (input?.message_id || '').trim();
  if (!messageId) {
    return { error: 'message_id is required (from email_search results).' };
  }

  const readThread = !!input?.thread;

  let client;
  try {
    client = await googleOAuth.getClient(personId);
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.message?.includes('expired') || err.message?.includes('revoked')) {
      return {
        error: `Gmail authorization has expired for ${personId}. They need to re-authorize (run: node scripts/gmail-auth.js ${personId}).`,
      };
    }
    log.error('Email read: getClient failed', { personId, error: err.message });
    return { error: `Gmail error: ${err.message}` };
  }

  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    if (readThread) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['Subject', 'Date'],
      });
      const threadId = msgRes.data.threadId;
      if (!threadId) {
        return { error: 'Could not get thread id for this message.' };
      }
      const threadRes = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });
      const messages = (threadRes.data.messages || []).sort(
        (a, b) => (parseInt(a.internalDate, 10) || 0) - (parseInt(b.internalDate, 10) || 0)
      );
      const formatted = messages.map((m) => formatMessage(m));
      return { messages: formatted, threadId, message: `Thread has ${formatted.length} message(s).` };
    }

    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    const message = formatMessage(msgRes.data);
    return message;
  } catch (err) {
    if (err.code === 404) return { error: 'Message not found. It may have been deleted.' };
    if (err.code === 429 || err.message?.includes('rate')) {
      return { error: 'Gmail is rate-limiting me. Try again in a minute.' };
    }
    log.error('Email read failed', { personId, error: err.message });
    return { error: `Gmail read failed: ${err.message}` };
  }
}
