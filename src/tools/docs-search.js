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

export const definition = {
  name: 'docs_search',
  description:
    'Search Google Drive for documents, spreadsheets, and other files. Returns file names, IDs, and URLs. Use docs_read to get file content.',
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description: 'Whose Drive to search (person id or display name). Default: the person speaking.',
      },
      query: {
        type: 'string',
        description:
          "Search query. Supports Drive query syntax: name contains 'budget', fullText contains 'vacation', mimeType = 'application/vnd.google-apps.document'.",
      },
      max_results: {
        type: 'number',
        description: 'Max files to return (default 10, max 25).',
      },
    },
  },
};

export async function execute(input, envelope) {
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: 'Could not identify whose Drive to search. Use person id (e.g. lee, steve).' };
  }

  if (!googleOAuth.hasToken(personId)) {
    const household = getHousehold();
    const name = household.members[personId]?.display_name ?? personId;
    return {
      error: `I don't have access to ${name}'s Google Drive yet. They need to authorize me first (run: node scripts/gmail-auth.js ${personId}).`,
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
        error: `Google authorization has expired for ${personId}. They need to re-authorize (run: node scripts/gmail-auth.js ${personId}).`,
      };
    }
    log.error('Docs search: getClient failed', { personId, error: err.message });
    return { error: `Google auth error: ${err.message}` };
  }

  const { google } = await import('googleapis');
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    const params = {
      pageSize: maxResults,
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners)',
      orderBy: 'modifiedTime desc',
    };

    if (query) {
      params.q = query;
    } else {
      // Default: only user-owned/accessible Docs and Sheets
      params.q = "mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet'";
    }

    const res = await drive.files.list(params);
    const files = res.data.files || [];

    if (files.length === 0) {
      return { results: [], message: 'No files found matching that query.' };
    }

    const results = files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
    }));

    return { results, message: `Found ${results.length} file(s).` };
  } catch (err) {
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return {
        error: `Google authorization expired for ${personId}. Re-authorize with: node scripts/gmail-auth.js ${personId}`,
      };
    }
    if (err.code === 403) {
      return {
        error: `Drive access denied for ${personId}. They may need to re-authorize with Drive permissions: node scripts/gmail-auth.js ${personId}`,
      };
    }
    if (err.code === 429 || err.message?.includes('rate')) {
      return { error: 'Google Drive is rate-limiting me. Try again in a minute.' };
    }
    log.error('Docs search failed', { personId, error: err.message });
    return { error: `Drive search failed: ${err.message}` };
  }
}
