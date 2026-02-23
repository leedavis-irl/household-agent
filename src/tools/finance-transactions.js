import * as monarch from '../utils/monarch.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'finance_transactions',
  description:
    'Search household financial transactions from Monarch Money. Can filter by date range, merchant name, category, or account. Returns transaction details including amount, merchant, category, date, and account.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Optional search term (merchant name, description). Leave empty for no text filter.',
      },
      start_date: {
        type: 'string',
        description: 'Start of date range in YYYY-MM-DD format. Default: 30 days ago.',
      },
      end_date: {
        type: 'string',
        description: 'End of date range in YYYY-MM-DD format. Default: today.',
      },
      category: {
        type: 'string',
        description: 'Optional category name to filter by (e.g. "Groceries", "Restaurants").',
      },
      account: {
        type: 'string',
        description: 'Optional account name to filter by (e.g. "Chase Checking").',
      },
      limit: {
        type: 'number',
        description: 'Max transactions to return (default 20, max 50).',
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

export async function execute(input, _envelope) {
  const limit = Math.min(50, Math.max(1, Number(input?.limit) || 20));
  const endDate = input?.end_date?.trim() || toISODate(new Date());
  const startDate =
    input?.start_date?.trim() ||
    toISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const search = (input?.query || '').trim();
  const categoryName = (input?.category || '').trim();
  const accountName = (input?.account || '').trim();

  let categoryIds = [];
  let accountIds = [];

  try {
    if (categoryName) {
      const categories = await monarch.getCategories();
      if (Array.isArray(categories)) {
        const match = categories.find(
          (c) => c?.name?.toLowerCase() === categoryName.toLowerCase()
        );
        if (match?.id) categoryIds = [match.id];
      }
    }
    if (accountName) {
      const accounts = await monarch.getAccounts();
      if (Array.isArray(accounts)) {
        const match = accounts.find(
          (a) => a?.displayName?.toLowerCase() === accountName.toLowerCase()
        );
        if (match?.id) accountIds = [match.id];
      }
    }
  } catch (e) {
    log.warn('Finance: could not resolve category/account filters', { error: e.message });
  }

  let data;
  try {
    data = await monarch.getTransactions({
      startDate: startDate,
      endDate: endDate,
      search: search || undefined,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      accountIds: accountIds.length ? accountIds : undefined,
      limit,
      offset: 0,
    });
  } catch (e) {
    log.error('Finance transactions failed', { error: e.message });
    return {
      error:
        'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  if (data === 'UNAUTHORIZED' || !data?.results) {
    return {
      error:
        'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  const results = (data.results || []).map((t) => ({
    date: t.date,
    merchant: t.merchant?.name ?? t.plaidName ?? 'Unknown',
    amount: t.amount != null ? (t.amount < 0 ? `-$${Math.abs(t.amount).toFixed(2)}` : `+$${Number(t.amount).toFixed(2)}`) : '—',
    category: t.category?.name ?? '—',
    account: t.account?.displayName ?? '—',
    pending: !!t.pending,
  }));

  if (results.length === 0) {
    return { message: 'No transactions found matching that search.', results: [] };
  }

  return {
    results,
    totalCount: data.totalCount ?? results.length,
    message: `Found ${results.length} transaction(s).`,
  };
}
