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

function checkEmailPermission(requestedPersonId, envelope) {
  const requesterId = (envelope.person_id || '').toLowerCase();
  if (requestedPersonId === requesterId) {
    return envelope.permissions?.includes('email_own') ?? false;
  }
  return envelope.permissions?.includes('email_all') ?? false;
}

export const definition = {
  name: 'email_search',
  description:
    "Search a person's Gmail for messages matching a query. Use Gmail search syntax: from:, to:, subject:, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, label:, is:unread. Returns message snippets — use email_read for full content.",
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description:
          "Whose email to search (person id or display name). Default: the person speaking.",
      },
      query: {
        type: 'string',
        description: 'Gmail search query (same syntax as Gmail search box).',
      },
      max_results: {
        type: 'number',
        description: 'Max messages to return (default 10, max 25).',
      },
    },
  },
};

export async function execute(input, envelope) {
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: 'Could not identify whose email to search. Use person id (e.g. lee, steve).' };
  }

  if (!checkEmailPermission(personId, envelope)) {
    return {
      error: `Permission denied: ${envelope.person} cannot search ${personId}'s email.`,
    };
  }

  if (!googleOAuth.hasToken(personId)) {
    const household = getHousehold();
    const name = household.members[personId]?.display_name ?? personId;
    return {
      error: `I don't have access to ${name}'s Gmail yet. They need to authorize me first (run: node scripts/gmail-auth.js ${personId}).`,
    };
  }

  const query = (input?.query || '').trim();
  const maxResults = Math.min(25, Math.max(1, Number(input?.max_results) || 10));

  let client;
  try {
    client = await googleOAuth.getClient(personId);
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.message?.includes('expired') || err.message?.includes('revoked')) {
      return {
        error: `Gmail authorization has expired for ${personId}. They need to re-authorize (run: node scripts/gmail-auth.js ${personId}).`,
      };
    }
    log.error('Email search: getClient failed', { personId, error: err.message });
    return { error: `Gmail error: ${err.message}` };
  }

  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query || undefined,
      maxResults,
    });
    const messageIds = listRes.data.messages?.map((m) => m.id) ?? [];
    if (messageIds.length === 0) {
      return { message: 'No emails found matching that search.', results: [] };
    }

    const metadataHeaders = ['From', 'To', 'Subject', 'Date'];
    const results = [];
    for (const id of messageIds) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: metadataHeaders,
      });
      const msg = msgRes.data;
      const headers = (msg.payload?.headers || []).reduce((acc, h) => {
        if (h.name && metadataHeaders.includes(h.name)) acc[h.name] = h.value;
        return acc;
      }, {});
      results.push({
        id: msg.id,
        threadId: msg.threadId,
        from: headers.From ?? '',
        to: headers.To ?? '',
        subject: headers.Subject ?? '',
        date: headers.Date ?? '',
        snippet: msg.snippet ?? '',
      });
    }

    return { results, message: `Found ${results.length} message(s).` };
  } catch (err) {
    if (err.code === 429 || err.message?.includes('rate')) {
      return { error: 'Gmail is rate-limiting me. Try again in a minute.' };
    }
    log.error('Email search failed', { personId, error: err.message });
    return { error: `Gmail search failed: ${err.message}` };
  }
}
