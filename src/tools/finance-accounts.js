import * as monarch from '../utils/monarch.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'finance_accounts',
  description:
    'Get a snapshot of all household financial accounts from Monarch Money — checking, savings, investment, credit cards, loans, 529s. Shows current balance, account type, and institution. Use this to answer questions about cash on hand, net worth, or specific account balances.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description:
          'Optional filter by account type: "depository" (checking/savings), "investment" (brokerage, 529, retirement), "credit" (credit cards), "loan" (mortgages, loans). Leave empty for all accounts.',
      },
      name: {
        type: 'string',
        description:
          'Optional filter by account name (partial match, case-insensitive). E.g. "529", "Chase", "Fidelity".',
      },
    },
  },
};

function formatBalance(amount) {
  if (amount == null) return '--';
  const abs = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function classifyType(account) {
  const typeName = account.type?.name?.toLowerCase() || '';
  if (typeName.includes('depository') || typeName.includes('checking') || typeName.includes('savings')) return 'depository';
  if (typeName.includes('investment') || typeName.includes('brokerage') || typeName.includes('retirement')) return 'investment';
  if (typeName.includes('credit')) return 'credit';
  if (typeName.includes('loan') || typeName.includes('mortgage')) return 'loan';
  return typeName || 'other';
}

export async function execute(input, _envelope) {
  const typeFilter = (input?.type || '').trim().toLowerCase();
  const nameFilter = (input?.name || '').trim().toLowerCase();

  let accounts;
  try {
    accounts = await monarch.getAccounts();
  } catch (e) {
    log.error('Finance accounts failed', { error: e.message });
    return {
      error: 'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  // TODO: existing auth bug — monarch.getAccounts() may return 'UNAUTHORIZED'
  // string on persistent session failures. Not fixing in this task.
  if (accounts === 'UNAUTHORIZED' || !Array.isArray(accounts)) {
    return {
      error: 'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  let results = accounts.map((a) => ({
    name: a.displayName || 'Unknown',
    type: classifyType(a),
    typeDisplay: a.type?.display || a.type?.name || '--',
    subtype: a.subtype?.display || a.subtype?.name || null,
    balance: a.currentBalance ?? a.displayBalance ?? null,
    balanceFormatted: formatBalance(a.currentBalance ?? a.displayBalance),
  }));

  if (typeFilter) {
    results = results.filter((a) => a.type === typeFilter);
  }
  if (nameFilter) {
    results = results.filter((a) => a.name.toLowerCase().includes(nameFilter));
  }

  if (results.length === 0) {
    const filterDesc = [typeFilter, nameFilter].filter(Boolean).join(', ');
    return {
      message: filterDesc
        ? `No accounts found matching: ${filterDesc}`
        : 'No accounts found in Monarch.',
      accounts: [],
    };
  }

  // Group by type for summary
  const byType = {};
  let totalNet = 0;
  for (const a of results) {
    if (!byType[a.typeDisplay]) byType[a.typeDisplay] = [];
    byType[a.typeDisplay].push(a);
    if (a.balance != null) totalNet += a.balance;
  }

  return {
    accounts: results,
    totalNetWorth: formatBalance(totalNet),
    totalNetWorthRaw: totalNet,
    accountCount: results.length,
    message: `${results.length} account(s) found. Net total: ${formatBalance(totalNet)}.`,
  };
}
