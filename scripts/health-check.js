#!/usr/bin/env node
/**
 * Daily dependency health check for Iji tools.
 *
 * Cron (EC2, from project root):
 * 1) 5 7 * * * cd /home/ubuntu/household-agent && /usr/bin/node scripts/health-check.js >> /home/ubuntu/household-agent/logs/health-check.log 2>&1
 * 2) Ensure SIGNAL_ACCOUNT and SIGNAL_CLI_PATH are set in .env for failure alerts.
 *
 * Writes STATUS.md with a timestamped summary and per-tool status table.
 * Sends a Signal DM to Lee if any check fails.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'household.json');
const STATUS_PATH = join(PROJECT_ROOT, 'STATUS.md');

const REQUIRED_FILES = {
  googleServiceAccount: join(PROJECT_ROOT, 'config', 'google-service-account.json'),
  googleOauthCredentials: join(PROJECT_ROOT, 'config', 'google-oauth-credentials.json'),
  oauthTokens: join(PROJECT_ROOT, 'data', 'oauth-tokens.json'),
};

const REQUIRED_TABLES = ['knowledge', 'signal_groups', 'claude_usage'];

function nowIso() {
  return new Date().toISOString();
}

function checkFile(path) {
  return existsSync(path) ? { ok: true } : { ok: false, error: `Missing file: ${path}` };
}

async function checkSignalDaemon(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 7583 });
    let settled = false;

    const done = (ok, error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok ? { ok: true } : { ok: false, error });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false, 'Signal daemon timeout on 127.0.0.1:7583'));
    socket.on('error', (err) => done(false, `Signal daemon unreachable: ${err.message}`));
  });
}

async function checkNwsReachable() {
  try {
    const res = await fetch('https://api.weather.gov/points/37.8716,-122.2727', {
      headers: { 'User-Agent': 'Iji health check (household-agent)' },
    });
    if (!res.ok) {
      return { ok: false, error: `NWS API returned ${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `NWS API request failed: ${err.message}` };
  }
}

async function checkHaReachable() {
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;
  if (!haUrl) return { ok: false, error: 'Missing env var HA_URL' };
  if (!haToken) return { ok: false, error: 'Missing env var HA_TOKEN' };
  try {
    const res = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
    });
    if (!res.ok) {
      return { ok: false, error: `HA API returned ${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `HA API request failed: ${err.message}` };
  }
}

function readHousehold() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

async function checkOauthRefresh() {
  const creds = checkFile(REQUIRED_FILES.googleOauthCredentials);
  if (!creds.ok) return creds;

  const tokensFile = checkFile(REQUIRED_FILES.oauthTokens);
  if (!tokensFile.ok) return tokensFile;

  try {
    const { getClient, hasToken } = await import('../src/utils/google-oauth.js');
    if (!hasToken('lee')) {
      return { ok: false, error: "OAuth token missing for 'lee'" };
    }
    const client = await getClient('lee');
    if (!client) {
      return { ok: false, error: "OAuth client unavailable for 'lee'" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `OAuth refresh failed: ${err.message}` };
  }
}

async function checkMonarchAuth() {
  if (!process.env.MONARCH_EMAIL || !process.env.MONARCH_PASSWORD) {
    return { ok: false, error: 'Missing env vars MONARCH_EMAIL and/or MONARCH_PASSWORD' };
  }
  try {
    const { healthCheck } = await import('../src/utils/monarch.js');
    const result = await healthCheck();
    if (!result?.ok) {
      return { ok: false, error: result?.error || 'Monarch health check failed' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Monarch auth failed: ${err.message}` };
  }
}

async function checkDatabase() {
  try {
    const { getDb } = await import('../src/utils/db.js');
    const db = getDb();
    const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map((r) => r.name);
    const missing = REQUIRED_TABLES.filter((t) => !existing.includes(t));
    if (missing.length) {
      return { ok: false, error: `Missing SQLite tables: ${missing.join(', ')}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `SQLite check failed: ${err.message}` };
  }
}

function checkFinancePaybacksFile() {
  const configured = process.env.MONARCH_PAYBACKS_STATE_FILE;
  const fallback = join(process.env.HOME || '', 'Projects/Financial/monarch-slack-integration/data/state.json');
  const chosen = configured || fallback;
  if (!existsSync(chosen)) {
    return {
      ok: false,
      error: `Paybacks state file missing at ${chosen}. Set MONARCH_PAYBACKS_STATE_FILE on EC2.`,
    };
  }
  return { ok: true };
}

function checkEnvVars(vars) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length) {
    return { ok: false, error: `Missing env vars: ${missing.join(', ')}` };
  }
  return { ok: true };
}

function toStatus(result) {
  return result.ok ? '✅ Verified' : '🔧 Fix pending';
}

function toRow(tool, file, result, notes) {
  return {
    tool,
    file,
    status: toStatus(result),
    notes: result.ok ? notes : `${notes} | ${result.error}`,
  };
}

function sendFailureAlert(leeNumber, failureCount, shortSummary) {
  const signalCli = process.env.SIGNAL_CLI_PATH || '/opt/signal-cli-0.13.24/bin/signal-cli';
  const account = process.env.SIGNAL_ACCOUNT;
  if (!leeNumber || !account || !existsSync(signalCli)) return;

  const msg = [
    'Iji health check failure',
    `Time: ${nowIso()}`,
    `Failures: ${failureCount}`,
    '',
    shortSummary.slice(0, 2500),
  ].join('\n');

  spawnSync(signalCli, ['-a', account, 'send', leeNumber, '--', msg], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
}

function renderStatusMd(rows, failureDetails) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const header = [
    `# Iji Status Check`,
    '',
    `Last check: ${nowIso()}`,
    '',
    `## Per-Tool Status`,
    '',
    `| Tool | File | Server Status | Notes |`,
    `|------|------|---------------|-------|`,
  ];

  const table = rows.map((r) => `| \`${esc(r.tool)}\` | \`${esc(r.file)}\` | ${esc(r.status)} | ${esc(r.notes)} |`);

  const failures = [
    '',
    '## Failures',
    '',
  ];

  if (failureDetails.length === 0) {
    failures.push('- None');
  } else {
    for (const f of failureDetails) failures.push(`- ${f}`);
  }

  return [...header, ...table, ...failures, ''].join('\n');
}

async function main() {
  const household = readHousehold();
  const leeNumber = household.members?.lee?.identifiers?.signal;

  const rows = [];
  const failureDetails = [];

  const dbCheck = await checkDatabase();
  const haCheck = await checkHaReachable();
  const signalCheck = await checkSignalDaemon();
  const nwsCheck = await checkNwsReachable();
  const oauthCheck = await checkOauthRefresh();
  const monarchCheck = await checkMonarchAuth();
  const serviceAccountCheck = checkFile(REQUIRED_FILES.googleServiceAccount);
  const financePaybacksCheck = checkFinancePaybacksFile();
  const claudeEnvCheck = checkEnvVars(['ANTHROPIC_API_KEY']);

  rows.push(toRow('knowledge_search', 'knowledge-search.js', dbCheck, 'SQLite availability and schema'));
  rows.push(toRow('knowledge_store', 'knowledge-store.js', dbCheck, 'SQLite availability and schema'));
  rows.push(toRow('ha_query', 'ha-query.js', haCheck, 'HA URL/token reachable'));
  rows.push(toRow('ha_control', 'ha-control.js', haCheck, 'HA URL/token reachable'));
  rows.push(toRow('calendar_query', 'calendar.js', serviceAccountCheck, 'Google service account file exists'));
  rows.push(toRow('calendar_create', 'calendar-create.js', serviceAccountCheck, 'Google service account file exists'));
  rows.push(toRow('calendar_modify', 'calendar-modify.js', serviceAccountCheck, 'Google service account file exists'));
  rows.push(toRow('calendar_freebusy', 'calendar-freebusy.js', serviceAccountCheck, 'Google service account file exists'));
  rows.push(toRow('message_send', 'message-send.js', signalCheck, 'Signal daemon reachable on TCP 7583'));
  rows.push(toRow('weather_query', 'weather-query.js', nwsCheck, 'NWS endpoint reachable'));
  rows.push(toRow('finance_accounts', 'finance-accounts.js', monarchCheck, 'Monarch auth health check'));
  rows.push(toRow('finance_budget_summary', 'finance-budget-summary.js', monarchCheck, 'Monarch auth health check'));
  rows.push(toRow('finance_transactions', 'finance-transactions.js', monarchCheck, 'Monarch auth health check'));
  rows.push(toRow('finance_paybacks', 'finance-paybacks.js', financePaybacksCheck, 'Paybacks state-file dependency'));
  rows.push(toRow('cost_query', 'cost-query.js', dbCheck, 'SQLite claude_usage table'));
  rows.push(toRow('email_search', 'email-search.js', oauthCheck, 'OAuth credentials + refresh token validation'));
  rows.push(toRow('email_read', 'email-read.js', oauthCheck, 'OAuth credentials + refresh token validation'));

  if (!claudeEnvCheck.ok) {
    failureDetails.push(`Global env: ${claudeEnvCheck.error}`);
  }

  for (const r of rows) {
    if (r.status !== '✅ Verified') {
      failureDetails.push(`${r.tool}: ${r.notes}`);
    }
  }

  writeFileSync(STATUS_PATH, renderStatusMd(rows, failureDetails), 'utf-8');

  if (failureDetails.length > 0) {
    sendFailureAlert(leeNumber, failureDetails.length, failureDetails.join('\n'));
  }
}

main().catch((err) => {
  const fallback = [
    '# Iji Status Check',
    '',
    `Last check: ${nowIso()}`,
    '',
    '## Failures',
    '',
    `- health-check script crashed: ${err.message}`,
    '',
  ].join('\n');
  writeFileSync(STATUS_PATH, fallback, 'utf-8');
  process.exit(1);
});
