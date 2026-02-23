#!/usr/bin/env node
/**
 * Weekly Iji (Claude API) cost report: sends Lee a Signal DM with summary.
 * Run from project root. Cron: same schedule as docs sync (e.g. Sunday 18:00).
 * See docs/cost-monitoring.md.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'household.json');

function log(level, msg, data = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...data }));
}

function getHouseholdConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('Config not found: ' + CONFIG_PATH);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function toYmd(d) {
  return d.toISOString().slice(0, 10);
}

function runQuery(db, fromTs, toTs, extra = '') {
  const sql = `
    SELECT SUM(estimated_cost_usd) AS total_cost_usd, COUNT(*) AS api_calls
    FROM claude_usage WHERE timestamp >= ? AND timestamp <= ? ${extra}
  `;
  const row = db.prepare(sql).get(fromTs, toTs);
  return { cost: row?.total_cost_usd ?? 0, calls: row?.api_calls ?? 0 };
}

function runByPerson(db, fromTs, toTs) {
  return db.prepare(`
    SELECT person_id, SUM(estimated_cost_usd) AS cost, COUNT(*) AS api_calls
    FROM claude_usage WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY person_id ORDER BY cost DESC
  `).all(fromTs, toTs);
}

async function main() {
  const config = getHouseholdConfig();
  const lee = config.members?.lee;
  const leeNumber = lee?.identifiers?.signal;
  if (!leeNumber) {
    log('error', 'Lee signal number not found in config (members.lee.identifiers.signal)');
    process.exit(1);
  }

  const { getDb } = await import('../src/utils/db.js');
  const db = getDb();

  const now = new Date();
  const endThisWeek = new Date(now);
  endThisWeek.setHours(23, 59, 59, 999);
  const startThisWeek = new Date(endThisWeek);
  startThisWeek.setDate(startThisWeek.getDate() - 6);
  startThisWeek.setHours(0, 0, 0, 0);
  const endLastWeek = new Date(startThisWeek);
  endLastWeek.setMilliseconds(-1);
  const startLastWeek = new Date(endLastWeek);
  startLastWeek.setDate(startLastWeek.getDate() - 6);
  startLastWeek.setHours(0, 0, 0, 0);

  const fromThisWeek = startThisWeek.toISOString();
  const toThisWeek = endThisWeek.toISOString();
  const fromLastWeek = startLastWeek.toISOString();
  const toLastWeek = endLastWeek.toISOString();

  const thisWeek = runQuery(db, fromThisWeek, toThisWeek);
  const lastWeek = runQuery(db, fromLastWeek, toLastWeek);
  const byPerson = runByPerson(db, fromThisWeek, toThisWeek);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromMonth = monthStart.toISOString();
  const toMonth = endThisWeek.toISOString();
  const monthTotal = runQuery(db, fromMonth, toMonth);

  const diff = thisWeek.cost - lastWeek.cost;
  const diffStr = diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
  const personLines = byPerson.length
    ? byPerson.map((r) => `  ${r.person_id}: $${Number(r.cost).toFixed(2)} (${r.api_calls} calls)`).join('\n')
    : '  (no usage)';

  const message = [
    '📊 Iji weekly cost report',
    '',
    `This week: $${thisWeek.cost.toFixed(2)} (${thisWeek.calls} API calls)`,
    `vs last week: ${diffStr}`,
    '',
    'By person:',
    personLines,
    '',
    `Running monthly total: $${monthTotal.cost.toFixed(2)}`,
  ].join('\n');

  const signalCli = process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli';
  const account = process.env.SIGNAL_ACCOUNT;
  if (!account) {
    log('warn', 'SIGNAL_ACCOUNT not set, skipping Signal DM');
    process.exit(0);
  }

  const r = spawnSync(signalCli, ['-a', account, 'send', leeNumber, '--', message], {
    stdio: 'pipe',
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
  });
  if (r.status !== 0) {
    log('error', 'Signal send failed', { stderr: r.stderr?.slice(0, 500), status: r.status });
    process.exit(1);
  }
  log('info', 'Weekly cost report sent to Lee', { recipient: leeNumber });
}

main().catch((err) => {
  log('error', 'weekly-cost-report failed', { error: err.message });
  process.exit(1);
});
