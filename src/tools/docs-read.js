import { getHousehold } from '../utils/config.js';
import * as googleOAuth from '../utils/google-oauth.js';
import log from '../utils/logger.js';

const MAX_CONTENT_CHARS = 8000;

const GDOC_MIME = 'application/vnd.google-apps.document';
const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

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

/**
 * Extract file ID from a Google Drive/Docs URL or return as-is if already an ID.
 * Handles: docs.google.com/document/d/<id>/edit, drive.google.com/file/d/<id>/, etc.
 */
function parseFileId(input) {
  if (!input) return null;
  // If it looks like a URL, extract the ID
  const match = input.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  // Otherwise assume it's a bare ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

/**
 * Extract plain text from a Google Docs document body.
 */
function extractDocsText(document) {
  const parts = [];
  const content = document.body?.content || [];

  for (const block of content) {
    if (block.paragraph) {
      const paraText = (block.paragraph.elements || [])
        .map((el) => el.textRun?.content || '')
        .join('');
      if (paraText.trim()) parts.push(paraText);
    } else if (block.table) {
      for (const row of block.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellBlock of cell.content || []) {
            if (cellBlock.paragraph) {
              const cellText = (cellBlock.paragraph.elements || [])
                .map((el) => el.textRun?.content || '')
                .join('');
              if (cellText.trim()) parts.push(cellText);
            }
          }
        }
      }
    }
  }

  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export const definition = {
  name: 'docs_read',
  description:
    'Read the content of a Google Doc or Google Sheet. Use docs_search first to find the file ID, or pass a Google Drive URL directly.',
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description: 'Whose Drive to read from (person id or display name). Default: the person speaking.',
      },
      file_id: {
        type: 'string',
        description: 'The Google Drive file ID (from docs_search results) or a Google Drive/Docs URL.',
      },
    },
    required: ['file_id'],
  },
};

export async function execute(input, envelope) {
  const personId = resolvePersonId(input?.person, envelope);
  if (!personId) {
    return { error: 'Could not identify whose Drive to read from. Use person id (e.g. lee, steve).' };
  }

  const fileId = parseFileId(input?.file_id || '');
  if (!fileId) {
    return { error: 'file_id is required. Provide a Drive file ID or a Google Docs/Drive URL.' };
  }

  if (!googleOAuth.hasToken(personId)) {
    const household = getHousehold();
    const name = household.members[personId]?.display_name ?? personId;
    return {
      error: `I don't have access to ${name}'s Google Drive yet. They need to authorize me first (run: node scripts/gmail-auth.js ${personId}).`,
    };
  }

  let client;
  try {
    client = await googleOAuth.getClient(personId);
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.message?.includes('expired') || err.message?.includes('revoked')) {
      return {
        error: `Google authorization has expired for ${personId}. They need to re-authorize (run: node scripts/gmail-auth.js ${personId}).`,
      };
    }
    log.error('Docs read: getClient failed', { personId, error: err.message });
    return { error: `Google auth error: ${err.message}` };
  }

  const { google } = await import('googleapis');
  const drive = google.drive({ version: 'v3', auth: client });

  // First, get file metadata to determine type
  let fileMeta;
  try {
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,modifiedTime,webViewLink',
    });
    fileMeta = metaRes.data;
  } catch (err) {
    if (err.code === 404) {
      return { error: 'File not found. Check the file ID or URL, and confirm the file is shared with this account.' };
    }
    if (err.code === 403) {
      return {
        error: `Access denied to this file for ${personId}. The file may not be shared, or Drive permissions need re-authorization: node scripts/gmail-auth.js ${personId}`,
      };
    }
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return {
        error: `Google authorization expired for ${personId}. Re-authorize with: node scripts/gmail-auth.js ${personId}`,
      };
    }
    log.error('Docs read: file metadata fetch failed', { personId, fileId, error: err.message });
    return { error: `Failed to access file: ${err.message}` };
  }

  const mimeType = fileMeta.mimeType || '';

  try {
    let content;

    if (mimeType === GDOC_MIME) {
      // Use Google Docs API for structured text extraction
      const docs = google.docs({ version: 'v1', auth: client });
      const docRes = await docs.documents.get({ documentId: fileId });
      content = extractDocsText(docRes.data);
    } else if (mimeType === GSHEET_MIME) {
      // Export Sheets as CSV
      const exportRes = await drive.files.export(
        { fileId, mimeType: 'text/csv' },
        { responseType: 'text' }
      );
      content = typeof exportRes.data === 'string' ? exportRes.data : JSON.stringify(exportRes.data);
    } else {
      return {
        error: `Unsupported file type: ${mimeType}. docs_read supports Google Docs and Google Sheets. Use docs_search to find supported files.`,
      };
    }

    let truncated = false;
    if (content.length > MAX_CONTENT_CHARS) {
      content = content.slice(0, MAX_CONTENT_CHARS) + `\n\n[Content truncated. Full document is ${content.length} characters.]`;
      truncated = true;
    }

    return {
      id: fileMeta.id,
      name: fileMeta.name,
      mimeType: fileMeta.mimeType,
      modifiedTime: fileMeta.modifiedTime,
      url: fileMeta.webViewLink,
      content,
      truncated,
    };
  } catch (err) {
    if (err.code === 403) {
      return {
        error: `Access denied reading file content for ${personId}. Drive permissions may need re-authorization: node scripts/gmail-auth.js ${personId}`,
      };
    }
    if (err.code === 429 || err.message?.includes('rate')) {
      return { error: 'Google APIs are rate-limiting me. Try again in a minute.' };
    }
    log.error('Docs read failed', { personId, fileId, mimeType, error: err.message });
    return { error: `Failed to read file content: ${err.message}` };
  }
}
