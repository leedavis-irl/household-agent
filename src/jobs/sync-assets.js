/**
 * Monthly Monarch → Google Sheets asset sync.
 *
 * Pulls account balances from Monarch, sums them by type, and writes totals
 * plus a "last synced" timestamp to the Assets tab of the finance spreadsheet.
 *
 * Cell targets (Assets tab):
 *   B9  — Total Investable (sum of type.name === 'investment')
 *   B18 — Total Illiquid   (sum of type.name === 'real_estate' || 'other_asset')
 *   B26 — Last synced timestamp (Pacific)
 *
 * Runs monthly via scheduler in src/index.js. Can also be invoked directly
 * for testing: `node src/jobs/sync-assets.js`.
 */
import { getAccounts } from '../utils/monarch.js';
import { writeValues } from '../utils/sheets.js';
import log from '../utils/logger.js';

const SPREADSHEET_ID_ENV = 'FINANCE_SPREADSHEET_ID';
const INVESTABLE_CELL = 'Assets!B9';
const ILLIQUID_CELL = 'Assets!B18';
const TIMESTAMP_CELL = 'Assets!B26';

class MonarchAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MonarchAuthError';
  }
}

class SheetsWriteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SheetsWriteError';
  }
}

function sumByType(accounts, typeNames) {
  const wanted = new Set(typeNames);
  let total = 0;
  for (const acc of accounts) {
    const typeName = acc?.type?.name;
    if (wanted.has(typeName)) {
      const balance = Number(acc.currentBalance ?? 0);
      if (Number.isFinite(balance)) total += balance;
    }
  }
  return total;
}

function pacificTimestamp() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()) + ' (Pacific)';
}

async function notifyLee(message) {
  try {
    const { getHousehold } = await import('../utils/config.js');
    const { sendMessage } = await import('../broker/signal.js');
    const h = getHousehold();
    const lee = h?.members?.lee;
    if (lee?.identifiers?.signal) {
      sendMessage(lee.identifiers.signal, message);
    } else {
      log.warn('Asset sync: cannot notify Lee — Signal identifier missing');
    }
  } catch (e) {
    log.error('Asset sync: notifier failed', { error: e.message });
  }
}

/**
 * Run the sync. Never throws — all errors are logged and (for auth/write
 * failures) Lee is alerted via Signal.
 * @returns {Promise<{ok: boolean, totalInvestable?: number, totalIlliquid?: number, error?: string}>}
 */
export async function syncAssets() {
  const spreadsheetId = process.env[SPREADSHEET_ID_ENV]?.trim();
  if (!spreadsheetId) {
    log.warn(`Asset sync skipped: ${SPREADSHEET_ID_ENV} not set`);
    return { ok: false, error: `${SPREADSHEET_ID_ENV} not set` };
  }

  try {
    // 1. Pull accounts from Monarch.
    let accounts;
    try {
      accounts = await getAccounts();
    } catch (err) {
      throw new MonarchAuthError(err.message);
    }
    if (accounts === 'UNAUTHORIZED') {
      throw new MonarchAuthError('Monarch returned UNAUTHORIZED after retry');
    }
    if (!Array.isArray(accounts)) {
      throw new MonarchAuthError('Monarch getAccounts did not return an array');
    }

    // 2. Sum by type.
    const totalInvestable = sumByType(accounts, ['investment']);
    const totalIlliquid = sumByType(accounts, ['real_estate', 'other_asset']);
    const timestamp = pacificTimestamp();

    log.info('Asset sync: computed totals', {
      accountCount: accounts.length,
      totalInvestable,
      totalIlliquid,
    });

    // 3. Write to Sheets.
    try {
      await writeValues(spreadsheetId, INVESTABLE_CELL, [[totalInvestable]]);
      await writeValues(spreadsheetId, ILLIQUID_CELL, [[totalIlliquid]]);
      await writeValues(spreadsheetId, TIMESTAMP_CELL, [[timestamp]]);
    } catch (err) {
      throw new SheetsWriteError(err.message);
    }

    log.info('Asset sync: complete', { totalInvestable, totalIlliquid, timestamp });
    return { ok: true, totalInvestable, totalIlliquid };
  } catch (err) {
    if (err instanceof MonarchAuthError) {
      log.error('Asset sync: Monarch auth failed', { error: err.message });
      await notifyLee('Asset sync failed: Monarch authentication error.');
      return { ok: false, error: err.message };
    }
    if (err instanceof SheetsWriteError) {
      log.error('Asset sync: Sheets write failed', { error: err.message });
      await notifyLee('Asset sync failed: Could not write to Google Sheets.');
      return { ok: false, error: err.message };
    }
    // Anything else — log but don't let it escape.
    log.error('Asset sync: unexpected error', { error: err.message, stack: err.stack });
    return { ok: false, error: err.message };
  }
}

// Pacific "is it the 1st at 6am" scheduler. Follows the setInterval +
// dedupe pattern used by morning-briefing.js, avoiding a node-cron dep.
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const ranThisMonth = new Set();

function pacificMonthKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()); // e.g. "2026-04"
}

function pacificParts() {
  const d = new Date();
  const day = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      day: 'numeric',
    }).format(d)
  );
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(d)
  );
  return { day, hour };
}

async function monthlyTick() {
  const { day, hour } = pacificParts();
  if (day !== 1 || hour < 6) return;
  const key = pacificMonthKey();
  if (ranThisMonth.has(key)) return;
  ranThisMonth.add(key);
  log.info('Asset sync: monthly trigger firing', { month: key });
  await syncAssets();
}

/**
 * Start the monthly scheduler. Also runs once at startup (after a short delay)
 * so the sheet is populated immediately on first deploy without waiting a
 * full month. Safe to call multiple times — setInterval will reschedule but
 * dedupe via ranThisMonth prevents duplicate monthly runs.
 */
export function startAssetSyncScheduler({ startupDelayMs = 30_000 } = {}) {
  setTimeout(() => {
    log.info('Asset sync: startup run');
    syncAssets().catch((e) =>
      log.error('Asset sync: startup run threw', { error: e.message })
    );
  }, startupDelayMs);

  setInterval(monthlyTick, CHECK_INTERVAL_MS);
}

// Direct invocation for testing: `node src/jobs/sync-assets.js`
// import.meta.url check — only run if this file is the entry point.
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('sync-assets.js');
if (isDirectRun) {
  // eslint-disable-next-line no-console
  console.log('Running asset sync directly...');
  syncAssets()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Fatal:', err);
      process.exit(1);
    });
}
