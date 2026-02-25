import { readFileSync, existsSync } from 'fs';
import log from '../utils/logger.js';

export const definition = {
  name: 'finance_paybacks',
  description:
    "Check the household payback ledger — who owes whom for shared expenses. Shows the current balance between adult household members. Uses the same state file as the Monarch-Slack integration when configured.",
  input_schema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description:
          "Optional. Filter to one person's balance (household member name, e.g. 'Steve', 'Lee').",
      },
      period: {
        type: 'string',
        description:
          "Optional. 'current' (default), 'month', or 'all-time'. Current/all-time show full ledger; 'month' shows only claims from the current month.",
      },
    },
  },
};

function getStateFilePath() {
  return process.env.MONARCH_PAYBACKS_STATE_FILE || '';
}

function loadState(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    return data?.transaction_ownership ? data : null;
  } catch (e) {
    log.warn('Finance paybacks: could not load state file', { path, error: e.message });
    return null;
  }
}

/**
 * Compute net balance per owner from transaction_ownership.
 * Negative = they owe; positive = credit (they paid back).
 */
function getBalancesByOwner(ownership, opts = {}) {
  const { period, person } = opts;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let entries = Object.values(ownership || {});
  if (period === 'month') {
    entries = entries.filter((e) => {
      const claimed = e.claimed_at ? new Date(e.claimed_at) : null;
      return claimed && claimed >= thisMonthStart;
    });
  }

  const balances = {};
  for (const t of entries) {
    const owner = t.owner_name;
    if (!owner) continue;
    if (person && owner.toLowerCase() !== person.trim().toLowerCase()) continue;
    const amount = Number(t.amount);
    if (!Number.isFinite(amount)) continue;
    balances[owner] = (balances[owner] || 0) + amount;
  }
  return balances;
}

export async function execute(input, _envelope) {
  const path = getStateFilePath();
  const state = loadState(path);

  if (!state) {
    return {
      message:
        'Payback ledger is not configured. Set MONARCH_PAYBACKS_STATE_FILE to the state.json path from the Monarch-Slack integration (e.g. data/state.json in that project), or add payback data there first.',
      balances: {},
    };
  }

  const period = (input?.period || 'current').toLowerCase();
  const person = (input?.person || '').trim();
  const balances = getBalancesByOwner(state, { period, person: person || undefined });

  const entries = Object.entries(balances);
  if (entries.length === 0) {
    const periodLabel = period === 'month' ? ' this month' : '';
    return {
      message: person
        ? `No payback activity${periodLabel} for ${person}.`
        : `No payback balances${periodLabel} recorded.`,
      balances: {},
    };
  }

  const sorted = entries.sort((a, b) => a[1] - b[1]); // most owed first
  const lines = sorted.map(([owner, balance]) => {
    const amt = Math.abs(balance).toFixed(2);
    if (balance < 0) return `${owner}: $${amt} owed`;
    if (balance > 0) return `${owner}: $${amt} credit`;
    return `${owner}: settled`;
  });

  const periodLabel =
    period === 'month' ? ' (this month)' : period === 'all-time' ? ' (all time)' : '';
  return {
    message: `Payback balances${periodLabel}:\n${lines.join('\n')}`,
    balances: Object.fromEntries(sorted),
  };
}
