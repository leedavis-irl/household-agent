import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import log from './logger.js';
import { getHousehold } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credentialsPath = join(__dirname, '../../config/google-service-account.json');

let calendarClient = null;

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type === 'year') out.year = Number(p.value);
    if (p.type === 'month') out.month = Number(p.value);
    if (p.type === 'day') out.day = Number(p.value);
    if (p.type === 'hour') out.hour = Number(p.value);
    if (p.type === 'minute') out.minute = Number(p.value);
  }
  // Intl with hour12:false and en-CA locale returns hour 24 for midnight on some
  // Node versions — normalize to 0 and advance the day.
  if (out.hour === 24) {
    out.hour = 0;
    const next = new Date(Date.UTC(out.year, out.month - 1, out.day + 1));
    out.year = next.getUTCFullYear();
    out.month = next.getUTCMonth() + 1;
    out.day = next.getUTCDate();
  }
  return out;
}

function datePartsToYmd(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return datePartsToYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function parseTimeString(timeStr) {
  const raw = String(timeStr || '').trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    const suffix = ampm[3].toLowerCase();
    if (minute < 0 || minute > 59 || hour < 1 || hour > 12) return null;
    if (suffix === 'am') hour = hour % 12;
    if (suffix === 'pm') hour = (hour % 12) + 12;
    return { hour, minute };
  }

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!hhmm) return null;
  const hour = Number(hhmm[1]);
  const minute = Number(hhmm[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getOffsetMinutesAtInstant(instantMs, timeZone) {
  const z = getZonedParts(new Date(instantMs), timeZone);
  const localAsUtcMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, 0, 0);
  return Math.round((localAsUtcMs - instantMs) / 60000);
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

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
 * Household timezone used for all calendar interpretation and display.
 */
export function getHouseholdTimezone() {
  return getHousehold().timezone || 'America/Los_Angeles';
}

/**
 * Parse date string (YYYY-MM-DD, "today", "tomorrow") and return YYYY-MM-DD in household timezone.
 * If resolved date is in the past, bumps it forward by one year.
 */
export function resolveDate(dateStr) {
  const tz = getHouseholdTimezone();
  const now = new Date();
  const todayParts = getZonedParts(now, tz);
  const today = datePartsToYmd(todayParts.year, todayParts.month, todayParts.day);

  const raw = (dateStr || 'today').toString().trim().toLowerCase();
  let resolved;
  if (raw === 'today') {
    resolved = today;
  } else if (raw === 'tomorrow') {
    resolved = addDays(today, 1);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    resolved = raw;
  } else {
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      const p = getZonedParts(parsed, tz);
      resolved = datePartsToYmd(p.year, p.month, p.day);
    } else {
      resolved = today;
    }
  }

  if (resolved < today) {
    const [year, month, day] = resolved.split('-').map(Number);
    const bumped = new Date(Date.UTC(year + 1, month - 1, day));
    resolved = datePartsToYmd(
      bumped.getUTCFullYear(),
      bumped.getUTCMonth() + 1,
      bumped.getUTCDate()
    );
  }
  return resolved;
}

/**
 * Convert UTC ISO string to household-local display string.
 * Example: 2026-04-15T14:00 (Pacific)
 */
export function toLocalISOString(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const tz = getHouseholdTimezone();
  const p = getZonedParts(date, tz);
  return `${datePartsToYmd(p.year, p.month, p.day)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} (Pacific)`;
}

/**
 * Convert household-local date+time (YYYY-MM-DD + HH:MM or h:mm AM/PM) to ISO 8601 with correct UTC offset.
 */
export function localDateTimeToISO(dateStr, timeStr) {
  const tz = getHouseholdTimezone();
  const date = resolveDate(dateStr);
  const [year, month, day] = date.split('-').map(Number);
  const t = parseTimeString(timeStr);
  if (!t) return null;

  // Iteratively solve for the UTC instant that corresponds to local wall clock time in timezone.
  let guessMs = Date.UTC(year, month - 1, day, t.hour, t.minute, 0, 0);
  for (let i = 0; i < 6; i++) {
    const z = getZonedParts(new Date(guessMs), tz);
    const desiredMs = Date.UTC(year, month - 1, day, t.hour, t.minute, 0, 0);
    const actualMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, 0, 0);
    const diff = desiredMs - actualMs;
    guessMs += diff;
    if (diff === 0) break;
  }

  const offset = getOffsetMinutesAtInstant(guessMs, tz);
  const offsetStr = formatOffset(offset);
  const localYmd = datePartsToYmd(year, month, day);
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `${localYmd}T${hh}:${mm}:00${offsetStr}`;
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
