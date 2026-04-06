/**
 * Google Sheets v4 writer. Reuses the per-user OAuth infrastructure in google-oauth.js.
 * Sheets writes are always performed on behalf of a specific household member whose
 * OAuth refresh token has been authorized for the SHEETS scope (default: lee).
 */
import { getClient, SHEETS_SCOPES } from './google-oauth.js';
import log from './logger.js';

let cachedSheetsClient = null;
let cachedPerson = null;

async function getSheetsClient(personId) {
  if (cachedSheetsClient && cachedPerson === personId) return cachedSheetsClient;

  const authClient = await getClient(personId, SHEETS_SCOPES);
  if (!authClient) {
    throw new Error(
      `No Google OAuth token for "${personId}". Re-authorize with the spreadsheets scope.`
    );
  }

  const { google } = await import('googleapis');
  cachedSheetsClient = google.sheets({ version: 'v4', auth: authClient });
  cachedPerson = personId;
  return cachedSheetsClient;
}

/**
 * Write values to a spreadsheet range using USER_ENTERED input mode (so
 * strings like "$1,234" parse as numbers and timestamps parse as dates).
 *
 * @param {string} spreadsheetId
 * @param {string} range - A1 notation, e.g. "Assets!B9"
 * @param {Array<Array<any>>} values - 2D array of cell values
 * @param {string} [personId='lee'] - household member whose OAuth token to use
 * @returns {Promise<object>} the API response data
 */
export async function writeValues(spreadsheetId, range, values, personId = 'lee') {
  if (!spreadsheetId) throw new Error('writeValues: spreadsheetId is required');
  if (!range) throw new Error('writeValues: range is required');
  if (!Array.isArray(values) || !Array.isArray(values[0])) {
    throw new Error('writeValues: values must be a 2D array');
  }

  const sheets = await getSheetsClient(personId);
  try {
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    log.info('Sheets write ok', {
      spreadsheetId,
      range,
      updatedCells: res.data?.updatedCells,
    });
    return res.data;
  } catch (err) {
    // Reset the cached client so a stale/revoked auth gets refreshed next call.
    cachedSheetsClient = null;
    cachedPerson = null;
    log.error('Sheets write failed', {
      spreadsheetId,
      range,
      error: err.message,
    });
    throw err;
  }
}
