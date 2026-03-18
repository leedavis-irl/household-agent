/**
 * Lightweight Supabase REST client for Education Advisor queries.
 * Uses the PostgREST API directly — no SDK dependency needed.
 */
import log from './logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

export async function query(table, params = '') {
  if (!isConfigured()) {
    throw new Error('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    log.error('Supabase query failed', { table, status: res.status, body: text.slice(0, 200) });
    throw new Error(`Supabase query failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function rpc(fn, params = {}) {
  if (!isConfigured()) {
    throw new Error('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error('Supabase RPC failed', { fn, status: res.status, body: text.slice(0, 200) });
    throw new Error(`Supabase RPC failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}
