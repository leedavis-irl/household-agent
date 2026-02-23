import { getDb } from './db.js';
import { estimateCost } from './claude-pricing.js';
import log from './logger.js';

/**
 * Record one Claude API call into claude_usage.
 * @param {object} envelope - { person_id, conversation_id }
 * @param {string} model - model id from API
 * @param {{ input_tokens: number, output_tokens: number }} usage - from response.usage
 */
export function recordUsage(envelope, model, usage) {
  const personId = envelope.person_id ?? envelope.person ?? 'unknown';
  const conversationId = envelope.conversation_id ?? null;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cost = estimateCost(model, inputTokens, outputTokens);

  try {
    const db = getDb();
    const ts = new Date().toISOString();
    db.prepare(
      `INSERT INTO claude_usage (timestamp, person_id, conversation_id, model, input_tokens, output_tokens, estimated_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ts, personId, conversationId, model, inputTokens, outputTokens, cost);
    log.debug('Claude usage recorded', {
      person_id: personId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    });
  } catch (err) {
    log.warn('Failed to record Claude usage', { error: err.message });
  }
}

/**
 * Get cost summary for a single calendar day (YYYY-MM-DD).
 * @param {string} dateYmd - e.g. '2025-02-20'
 * @returns {{ date: string, total_cost_usd: number, total_api_calls: number, by_person: Array }}
 */
export function getDailySummary(dateYmd) {
  const db = getDb();
  const fromTs = `${dateYmd}T00:00:00.000Z`;
  const toTs = `${dateYmd}T23:59:59.999Z`;
  const totalRow = db.prepare(
    `SELECT SUM(estimated_cost_usd) AS total_cost_usd, COUNT(*) AS api_calls
     FROM claude_usage WHERE timestamp >= ? AND timestamp <= ?`
  ).get(fromTs, toTs);
  const byPerson = db.prepare(
    `SELECT person_id, SUM(estimated_cost_usd) AS cost, COUNT(*) AS api_calls
     FROM claude_usage WHERE timestamp >= ? AND timestamp <= ?
     GROUP BY person_id ORDER BY cost DESC`
  ).all(fromTs, toTs);
  const totalCost = totalRow?.total_cost_usd ?? 0;
  const totalCalls = totalRow?.api_calls ?? 0;
  return {
    date: dateYmd,
    total_cost_usd: Math.round(totalCost * 1e4) / 1e4,
    total_api_calls: totalCalls,
    by_person: byPerson.map((r) => ({
      person_id: r.person_id,
      total_cost_usd: Math.round(r.cost * 1e4) / 1e4,
      api_calls: r.api_calls,
    })),
  };
}

const MS_PER_HOUR = 60 * 60 * 1000;
let lastDailySummaryDate = null;

/**
 * Run once per hour; if we've crossed into a new day, log yesterday's cost summary to the structured log.
 */
function runDailySummaryIfNeeded() {
  const yesterday = new Date(Date.now() - 24 * MS_PER_HOUR).toISOString().slice(0, 10);
  if (lastDailySummaryDate === yesterday) return;
  const summary = getDailySummary(yesterday);
  lastDailySummaryDate = yesterday;
  log.info('Daily cost summary', summary);
}

/**
 * Start the daily cost summary scheduler (runs every hour, logs previous calendar day once per day).
 */
export function startDailySummaryScheduler() {
  runDailySummaryIfNeeded();
  setInterval(runDailySummaryIfNeeded, MS_PER_HOUR);
}
