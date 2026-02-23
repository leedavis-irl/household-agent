import { getDb } from '../utils/db.js';

export const definition = {
  name: 'cost_query',
  description:
    'Query Iji (Claude API) cost and usage. Use this to answer questions like: how much has Iji cost this month?, what is the daily average?, who uses Iji the most? Supports filtering by date range and person.',
  input_schema: {
    type: 'object',
    properties: {
      date_from: {
        type: 'string',
        description: 'Start of date range in YYYY-MM-DD. Default: start of current month.',
      },
      date_to: {
        type: 'string',
        description: 'End of date range in YYYY-MM-DD. Default: today.',
      },
      person_id: {
        type: 'string',
        description: 'Optional. Filter by person (e.g. lee, steve). Omit for all people.',
      },
      group_by: {
        type: 'string',
        enum: ['day', 'person', 'none'],
        description: 'Optional. "day" for daily totals, "person" for per-person breakdown, "none" for single totals. Default: none.',
      },
    },
  },
};

function toISODate(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function execute(input, _envelope) {
  const today = toISODate(new Date());
  const startOfMonth = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const dateFrom = (input?.date_from || startOfMonth).trim();
  const dateTo = (input?.date_to || today).trim();
  const personId = (input?.person_id || '').trim().toLowerCase() || null;
  const groupBy = (input?.group_by || 'none').toLowerCase();

  const db = getDb();

  // Base filter: timestamp between date_from 00:00 and date_to 23:59
  const fromTs = `${dateFrom}T00:00:00.000Z`;
  const toTs = `${dateTo}T23:59:59.999Z`;

  if (groupBy === 'person') {
    const stmt = db.prepare(`
      SELECT person_id,
             SUM(estimated_cost_usd) AS total_cost_usd,
             SUM(input_tokens + output_tokens) AS total_tokens,
             COUNT(*) AS api_calls
      FROM claude_usage
      WHERE timestamp >= ? AND timestamp <= ?
        AND (? IS NULL OR person_id = ?)
      GROUP BY person_id
      ORDER BY total_cost_usd DESC
    `);
    const rows = stmt.all(fromTs, toTs, personId, personId);
    const days = (new Date(toTs) - new Date(fromTs)) / (24 * 60 * 60 * 1000) + 1;
    const totalCost = rows.reduce((s, r) => s + r.total_cost_usd, 0);
    const totalCalls = rows.reduce((s, r) => s + r.api_calls, 0);
    return {
      date_from: dateFrom,
      date_to: dateTo,
      total_cost_usd: Math.round(totalCost * 1e4) / 1e4,
      total_api_calls: totalCalls,
      daily_average_cost_usd: days > 0 ? Math.round((totalCost / days) * 1e4) / 1e4 : 0,
      by_person: rows.map((r) => ({
        person_id: r.person_id,
        total_cost_usd: Math.round(r.total_cost_usd * 1e4) / 1e4,
        total_tokens: r.total_tokens,
        api_calls: r.api_calls,
      })),
    };
  }

  if (groupBy === 'day') {
    const stmt = db.prepare(`
      SELECT date(timestamp) AS day,
             SUM(estimated_cost_usd) AS total_cost_usd,
             COUNT(*) AS api_calls
      FROM claude_usage
      WHERE timestamp >= ? AND timestamp <= ?
        AND (? IS NULL OR person_id = ?)
      GROUP BY date(timestamp)
      ORDER BY day ASC
    `);
    const rows = stmt.all(fromTs, toTs, personId, personId);
    const totalCost = rows.reduce((s, r) => s + r.total_cost_usd, 0);
    const totalCalls = rows.reduce((s, r) => s + r.api_calls, 0);
    const days = rows.length || 1;
    return {
      date_from: dateFrom,
      date_to: dateTo,
      total_cost_usd: Math.round(totalCost * 1e4) / 1e4,
      total_api_calls: totalCalls,
      daily_average_cost_usd: Math.round((totalCost / days) * 1e4) / 1e4,
      by_day: rows.map((r) => ({
        day: r.day,
        total_cost_usd: Math.round(r.total_cost_usd * 1e4) / 1e4,
        api_calls: r.api_calls,
      })),
    };
  }

  // none: single totals
  const stmt = db.prepare(`
    SELECT SUM(estimated_cost_usd) AS total_cost_usd,
           SUM(input_tokens + output_tokens) AS total_tokens,
           COUNT(*) AS api_calls
    FROM claude_usage
    WHERE timestamp >= ? AND timestamp <= ?
      AND (? IS NULL OR person_id = ?)
  `);
  const row = stmt.get(fromTs, toTs, personId, personId);
  const totalCost = row?.total_cost_usd ?? 0;
  const totalCalls = row?.api_calls ?? 0;
  const days = (new Date(toTs) - new Date(fromTs)) / (24 * 60 * 60 * 1000) + 1;
  return {
    date_from: dateFrom,
    date_to: dateTo,
    total_cost_usd: Math.round(totalCost * 1e4) / 1e4,
    total_api_calls: totalCalls,
    total_tokens: row?.total_tokens ?? 0,
    daily_average_cost_usd: days > 0 ? Math.round((totalCost / days) * 1e4) / 1e4 : 0,
  };
}
