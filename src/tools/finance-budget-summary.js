import * as monarch from '../utils/monarch.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'finance_budget_summary',
  description:
    'Get the household budget vs. actual spending for a given month from Monarch Money. Shows each budget category with planned amount, actual spend, remaining, and percent used. Use this to answer questions about budget health, overspending, and where to trim.',
  input_schema: {
    type: 'object',
    properties: {
      month: {
        type: 'number',
        description: 'Month number (1-12). Default: current month.',
      },
      year: {
        type: 'number',
        description: 'Four-digit year. Default: current year.',
      },
    },
  },
};

function formatDollars(amount) {
  if (amount == null) return '--';
  const abs = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

/**
 * Build a category lookup from categoryGroups returned by the budget query.
 * Returns Map<categoryId, { name, groupName, groupType }>
 */
function buildCategoryLookup(categoryGroups) {
  const lookup = new Map();
  if (!Array.isArray(categoryGroups)) return lookup;
  for (const group of categoryGroups) {
    for (const cat of group.categories || []) {
      lookup.set(cat.id, {
        name: cat.name,
        groupName: group.name,
        groupType: group.type,
      });
    }
  }
  return lookup;
}

export async function execute(input, _envelope) {
  const now = new Date();
  const month = Math.max(1, Math.min(12, Number(input?.month) || (now.getMonth() + 1)));
  const year = Number(input?.year) || now.getFullYear();

  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-${lastDay}`;

  let data;
  try {
    data = await monarch.getBudgets({ startDate, endDate });
  } catch (e) {
    log.error('Finance budget summary failed', { error: e.message });
    return {
      error: 'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  // TODO: existing auth bug — monarch.getBudgets() may return 'UNAUTHORIZED'
  // string on persistent session failures. Not fixing in this task.
  if (data === 'UNAUTHORIZED' || !data) {
    return {
      error: 'Financial data is temporarily unavailable. Lee has been notified.',
    };
  }

  const budgetData = data.budgetData;
  const categoryGroups = data.categoryGroups;

  if (!budgetData) {
    return {
      message: 'No budget data available for this month. Budgets may not be configured in Monarch.',
      categories: [],
    };
  }

  const catLookup = buildCategoryLookup(categoryGroups);
  const categories = [];

  for (const entry of budgetData.monthlyAmountsByCategory || []) {
    const catId = entry.category?.id;
    const catInfo = catLookup.get(catId) || { name: catId || 'Unknown', groupName: '--' };
    const amounts = (entry.monthlyAmounts || []).find(
      (a) => a.month && a.month.startsWith(`${year}-${mm}`)
    );

    if (!amounts) continue;

    const planned = amounts.plannedCashFlowAmount ?? 0;
    const actual = amounts.actualAmount ?? 0;
    const remaining = amounts.remainingAmount ?? (planned - Math.abs(actual));

    // Skip categories with no budget and no spend
    if (planned === 0 && actual === 0) continue;

    const percentUsed = planned !== 0 ? Math.round((Math.abs(actual) / Math.abs(planned)) * 100) : null;

    categories.push({
      category: catInfo.name,
      group: catInfo.groupName,
      budgeted: formatDollars(planned),
      spent: formatDollars(actual),
      remaining: formatDollars(remaining),
      percentUsed: percentUsed != null ? `${percentUsed}%` : '--',
      budgetedRaw: planned,
      spentRaw: actual,
      remainingRaw: remaining,
    });
  }

  // Sort: over-budget first (highest percentUsed), then by spend
  categories.sort((a, b) => {
    const aPct = parseInt(a.percentUsed) || 0;
    const bPct = parseInt(b.percentUsed) || 0;
    return bPct - aPct;
  });

  // Totals from the API
  const totals = (budgetData.totalsByMonth || []).find(
    (t) => t.month && t.month.startsWith(`${year}-${mm}`)
  );
  const totalExpenses = totals?.totalExpenses || {};
  const totalIncome = totals?.totalIncome || {};

  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

  return {
    month: `${monthName} ${year}`,
    categories,
    totals: {
      incomePlanned: formatDollars(totalIncome.plannedAmount),
      incomeActual: formatDollars(totalIncome.actualAmount),
      expensesPlanned: formatDollars(totalExpenses.plannedAmount),
      expensesActual: formatDollars(totalExpenses.actualAmount),
      expensesRemaining: formatDollars(totalExpenses.remainingAmount),
    },
    categoryCount: categories.length,
    message: `Budget summary for ${monthName} ${year}: ${categories.length} active categories.`,
  };
}
