/**
 * Monarch Money GraphQL client — session auth with TOTP MFA, auto-relogin, health check.
 * Uses unofficial api.monarch.com API (reverse-engineered).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TOTP } from 'otpauth';
import log from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const SESSION_FILE = join(DATA_DIR, 'monarch-session.json');

const BASE_URL = 'https://api.monarch.com';
const LOGIN_URL = `${BASE_URL}/auth/login/`;
const GRAPHQL_URL = `${BASE_URL}/graphql`;

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Client-Platform': 'web',
  'User-Agent': 'Iji Household Agent (Monarch Money)',
};

let cachedToken = null;
let authFailureNotifier = null;

function getSessionPath() {
  return process.env.MONARCH_SESSION_FILE || SESSION_FILE;
}

function isJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

function loadStoredSession() {
  const path = getSessionPath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    const token = data?.token;
    if (!token || isJwt(token)) return null;
    return token;
  } catch {
    return null;
  }
}

function saveSession(token) {
  if (!token || isJwt(token)) {
    log.warn('Monarch: refusing to save JWT-style token');
    return;
  }
  const path = getSessionPath();
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ token }, null, 2), 'utf-8');
  cachedToken = token;
}

function clearSession() {
  cachedToken = null;
  const path = getSessionPath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch (e) {
      log.warn('Monarch: could not delete session file', { error: e.message });
    }
  }
}

function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = loadStoredSession();
  return cachedToken;
}

function setToken(token) {
  cachedToken = token;
}

function generateTOTP() {
  const secret = process.env.MONARCH_TOTP_SECRET;
  if (!secret?.trim()) throw new Error('MONARCH_TOTP_SECRET is required for MFA');
  const totp = new TOTP({
    secret: secret.trim().replace(/\s/g, ''),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

/**
 * Perform login: POST email/password; if 403, submit TOTP and complete login.
 * Stores long-lived token in session file. Throws on failure.
 */
export async function login() {
  const email = process.env.MONARCH_EMAIL?.trim();
  const password = process.env.MONARCH_PASSWORD;
  if (!email || !password) {
    throw new Error('MONARCH_EMAIL and MONARCH_PASSWORD are required');
  }

  const body = {
    username: email,
    password,
    supports_mfa: true,
    trusted_device: true,
  };

  // First attempt: optionally include TOTP if we have it (avoids 403 round-trip)
  const totpSecret = process.env.MONARCH_TOTP_SECRET?.trim();
  if (totpSecret) {
    try {
      body.totp = generateTOTP();
    } catch (e) {
      log.warn('Monarch: could not generate TOTP for initial login', { error: e.message });
    }
  }

  let res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  });

  if (res.status === 403) {
    // MFA required — submit TOTP
    const code = generateTOTP();
    res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        username: email,
        password,
        supports_mfa: true,
        trusted_device: true,
        totp: code,
      }),
    });
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j.detail) detail = j.detail;
      else if (j.error_code) detail = j.error_code;
    } catch {}
    throw new Error(`Monarch login failed: ${detail}`);
  }

  const data = await res.json();
  const token = data?.token;
  const tokenExpiration = data?.tokenExpiration;

  if (!token) throw new Error('Monarch login succeeded but no token returned');
  if (isJwt(token)) {
    throw new Error('Monarch returned a short-lived JWT; need long-lived session token (complete MFA as trusted device).');
  }
  if (tokenExpiration != null && tokenExpiration !== 'null') {
    throw new Error(`Monarch returned short-lived token (tokenExpiration=${tokenExpiration}). Use trusted_device and complete MFA.`);
  }

  setToken(token);
  saveSession(token);
  log.info('Monarch login successful');
  return token;
}

/**
 * Ensure we have a valid token; if not or on 401, re-login (with TOTP) and retry once.
 */
async function withAuth(fn) {
  let token = getToken();
  if (!token) {
    await login();
    token = getToken();
  }

  let result = await fn(token);
  if (result === 'UNAUTHORIZED') {
    clearSession();
    await login();
    token = getToken();
    result = await fn(token);
  }
  return result;
}

async function graphql(operationName, query, variables = {}, token) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
  });

  if (res.status === 401 || res.status === 403) return 'UNAUTHORIZED';

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monarch GraphQL error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data?.errors?.length) {
    throw new Error(`Monarch GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data?.data ?? data;
}

const GET_ACCOUNTS_QUERY = `
  query GetAccounts {
    accounts {
      id
      displayName
      currentBalance
      displayBalance
      type { name display }
      subtype { name display }
      __typename
    }
    __typename
  }
`;

const GET_CATEGORIES_QUERY = `
  query GetCategories {
    categories {
      id
      name
      order
      group { id name type }
      __typename
    }
    __typename
  }
`;

const GET_BUDGET_QUERY = `
  query GetJointPlanningData($startDate: Date!, $endDate: Date!, $useV2Goals: Boolean!) {
    budgetData(startMonth: $startDate, endMonth: $endDate) {
      monthlyAmountsByCategory {
        category {
          id
          __typename
        }
        monthlyAmounts {
          month
          plannedCashFlowAmount
          actualAmount
          remainingAmount
          __typename
        }
        __typename
      }
      totalsByMonth {
        month
        totalIncome {
          plannedAmount
          actualAmount
          remainingAmount
          __typename
        }
        totalExpenses {
          plannedAmount
          actualAmount
          remainingAmount
          __typename
        }
        __typename
      }
      __typename
    }
    categoryGroups {
      id
      name
      order
      type
      categories {
        id
        name
        order
        __typename
      }
      __typename
    }
    goalsV2 @include(if: $useV2Goals) {
      id
      name
      __typename
    }
    budgetSystem
  }
`;

const GET_TRANSACTIONS_QUERY = `
  query GetTransactionsList($offset: Int, $limit: Int, $filters: TransactionFilterInput, $orderBy: TransactionOrdering) {
    allTransactions(filters: $filters) {
      totalCount
      results(offset: $offset, limit: $limit, orderBy: $orderBy) {
        id
        amount
        pending
        date
        hideFromReports
        plaidName
        notes
        needsReview
        category { id name }
        merchant { id name }
        account { id displayName }
        __typename
      }
      __typename
    }
    __typename
  }
`;

/**
 * Get accounts with balances.
 */
export async function getAccounts() {
  return withAuth(async (token) => {
    const data = await graphql('GetAccounts', GET_ACCOUNTS_QUERY, {}, token);
    if (data === 'UNAUTHORIZED') return data;
    return data?.accounts ?? [];
  });
}

/**
 * Get transaction categories.
 */
export async function getCategories() {
  return withAuth(async (token) => {
    const data = await graphql('GetCategories', GET_CATEGORIES_QUERY, {}, token);
    if (data === 'UNAUTHORIZED') return data;
    return data?.categories ?? [];
  });
}

/**
 * Get budget data for a given month range.
 * @param {Object} [opts]
 * @param {string} [opts.startDate] - YYYY-MM-DD (default: first of current month)
 * @param {string} [opts.endDate] - YYYY-MM-DD (default: last of current month)
 */
export async function getBudgets(opts = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startDate = opts.startDate || `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const endDate = opts.endDate || `${y}-${String(m + 1).padStart(2, '0')}-${lastDay}`;

  return withAuth(async (token) => {
    const data = await graphql(
      'GetJointPlanningData',
      GET_BUDGET_QUERY,
      { startDate, endDate, useV2Goals: false },
      token
    );
    if (data === 'UNAUTHORIZED') return data;
    return data;
  });
}

/**
 * Get transactions with optional filters.
 * @param {Object} opts
 * @param {string} [opts.startDate] - YYYY-MM-DD
 * @param {string} [opts.endDate] - YYYY-MM-DD
 * @param {string} [opts.search]
 * @param {string[]} [opts.categoryIds]
 * @param {string[]} [opts.accountIds]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 */
export async function getTransactions(opts = {}) {
  const {
    startDate,
    endDate,
    search = '',
    categoryIds = [],
    accountIds = [],
    limit = 100,
    offset = 0,
  } = opts;

  const filters = {
    search: search || undefined,
    categories: categoryIds.length ? categoryIds : undefined,
    accounts: accountIds.length ? accountIds : undefined,
  };
  if (startDate && endDate) {
    filters.startDate = startDate;
    filters.endDate = endDate;
  }

  return withAuth(async (token) => {
    const data = await graphql(
      'GetTransactionsList',
      GET_TRANSACTIONS_QUERY,
      {
        offset,
        limit,
        orderBy: 'date',
        filters,
      },
      token
    );
    if (data === 'UNAUTHORIZED') return data;
    const at = data?.allTransactions;
    return {
      totalCount: at?.totalCount ?? 0,
      results: at?.results ?? [],
    };
  });
}

/**
 * Set a function to call when Monarch auth fails after retry (e.g. send Signal to Lee).
 * Signature: (message: string) => void
 */
export function setAuthFailureNotifier(fn) {
  authFailureNotifier = fn;
}

function notifyAuthFailure(message) {
  if (authFailureNotifier) {
    try {
      authFailureNotifier(message);
    } catch (e) {
      log.error('Monarch auth failure notifier threw', { error: e.message });
    }
  }
}

/**
 * Verify session is valid; if not, re-login. On persistent failure, notify Lee.
 * Call on startup and periodically (e.g. every 6 hours).
 */
export async function healthCheck() {
  const email = process.env.MONARCH_EMAIL?.trim();
  const password = process.env.MONARCH_PASSWORD;
  if (!email || !password) {
    log.debug('Monarch health check skipped — credentials not set');
    return { ok: true, skipped: true };
  }

  try {
    const accounts = await getAccounts();
    if (accounts === 'UNAUTHORIZED') {
      clearSession();
      await login();
      const retry = await getAccounts();
      if (retry === 'UNAUTHORIZED') {
        const msg = "Monarch Money authentication failed. I can't access financial data until this is fixed.";
        log.error('Monarch health check failed after re-login');
        notifyAuthFailure(msg);
        return { ok: false, error: msg };
      }
    }
    return { ok: true };
  } catch (e) {
    log.error('Monarch health check error', { error: e.message });
    const msg = "Monarch Money authentication failed. I can't access financial data until this is fixed.";
    notifyAuthFailure(msg);
    return { ok: false, error: e.message };
  }
}
