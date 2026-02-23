import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import log from './logger.js';
import { getHousehold } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credentialsPath = join(__dirname, '../../config/google-service-account.json');

let calendarClient = null;

/**
 * Get shared Google Calendar API client (full read/write scope).
 * Returns null if credentials file is missing or invalid.
 */
export async function getCalendarClient() {
  if (calendarClient) return calendarClient;

  if (!existsSync(credentialsPath)) {
    log.error('Google Calendar credentials file not found', { path: credentialsPath });
    return null;
  }

  try {
    const { google } = await import('googleapis');
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    calendarClient = google.calendar({ version: 'v3', auth });
    return calendarClient;
  } catch (err) {
    log.error('Failed to init Google Calendar', { error: err.message });
    return null;
  }
}

/**
 * Build map of member id -> calendar id from household.json (members with calendar_id only).
 */
export function getCalendarIds() {
  const household = getHousehold();
  const ids = {};
  for (const [memberId, member] of Object.entries(household.members)) {
    if (member.calendar_id) ids[memberId] = member.calendar_id;
  }
  return ids;
}

/**
 * Parse date string (YYYY-MM-DD, "today", "tomorrow") to Date at start of day.
 */
export function resolveDate(dateStr) {
  if (!dateStr || dateStr === 'today') return new Date();
  if (dateStr === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }
  return new Date(dateStr);
}

/**
 * Check if an error from the Calendar API indicates the calendar is read-only (insufficient permissions).
 */
export function isReadOnlyCalendarError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    err?.code === 403 ||
    msg.includes('forbidden') ||
    msg.includes('insufficient') ||
    msg.includes('access not configured') ||
    msg.includes('does not have permission')
  );
}
