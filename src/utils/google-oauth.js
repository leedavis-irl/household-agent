/**
 * Per-user OAuth2 token manager for Google APIs (Gmail, Drive).
 * Uses config/google-oauth-credentials.json and stores refresh tokens in data/oauth-tokens.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import log from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, '../../config/google-oauth-credentials.json');
const TOKENS_PATH = join(__dirname, '../../data/oauth-tokens.json');

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const REDIRECT_URI_OOB = 'urn:ietf:wg:oauth:2.0:oob';

let OAuth2Client = null;

async function getOAuth2Constructor() {
  if (OAuth2Client) return OAuth2Client;
  const { google } = await import('googleapis');
  OAuth2Client = google.auth.OAuth2;
  return OAuth2Client;
}

function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `OAuth credentials not found at ${CREDENTIALS_PATH}. Download from Google Cloud Console (OAuth 2.0 Client ID, Desktop app).`
    );
  }
  const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const creds = data.installed || data.web;
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error('Invalid OAuth credentials: need client_id and client_secret.');
  }
  const redirectUri =
    creds.redirect_uris?.[0] ||
    creds.redirect_uri ||
    REDIRECT_URI_OOB;
  return { clientId: creds.client_id, clientSecret: creds.client_secret, redirectUri };
}

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  const dir = dirname(TOKENS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

/**
 * Get an authenticated OAuth2 client for the given person (auto-refreshes access token).
 * @param {string} personId - household member id (e.g. 'lee', 'steve')
 * @returns {Promise<import('googleapis').auth.OAuth2Client|null>} client or null if no token
 */
export async function getClient(personId, scopes = [GMAIL_SCOPE]) {
  const person = (personId || '').toLowerCase().trim();
  if (!person) return null;

  const tokens = loadTokens();
  const stored = tokens[person];
  if (!stored?.refresh_token) return null;

  const { clientId, clientSecret, redirectUri } = loadCredentials();
  const OAuth2 = await getOAuth2Constructor();
  const client = new OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({
    refresh_token: stored.refresh_token,
    scope: scopes.join(' '),
  });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token) client.setCredentials(credentials);
    return client;
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired or revoked')) {
      log.warn('Google OAuth token invalid or revoked', { personId: person });
      delete tokens[person];
      saveTokens(tokens);
    }
    throw err;
  }
}

/**
 * Get the authorization URL for a person to grant access (initial setup).
 * @param {string} personId
 * @param {string[]} [scopes]
 * @param {{ redirectUri?: string }} [options] - If provided (e.g. http://localhost:3000/callback), use for local server flow
 * @returns {Promise<string>}
 */
export async function getAuthUrl(personId, scopes = [GMAIL_SCOPE], options = {}) {
  const person = (personId || '').toLowerCase().trim();
  if (!person) throw new Error('personId is required');

  const creds = loadCredentials();
  const redirectUri = options.redirectUri ?? creds.redirectUri;
  const OAuth2 = await getOAuth2Constructor();
  const client = new OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
}

/**
 * Exchange an auth code for tokens and store them for the person.
 * @param {string} personId
 * @param {string} authCode - code from redirect or paste-after-consent
 * @param {string[]} [scopes]
 * @param {{ redirectUri?: string }} [options] - Must match the redirect_uri used in getAuthUrl for this flow
 */
export async function handleCallback(personId, authCode, scopes = [GMAIL_SCOPE], options = {}) {
  const person = (personId || '').toLowerCase().trim();
  const code = (authCode || '').trim();
  if (!person || !code) throw new Error('personId and authCode are required');

  const creds = loadCredentials();
  const redirectUri = options.redirectUri ?? creds.redirectUri;
  const OAuth2 = await getOAuth2Constructor();
  const client = new OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  const { tokens } = await client.getToken(code);
  const tokensFile = loadTokens();
  tokensFile[person] = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
  };
  saveTokens(tokensFile);
  log.info('Google OAuth tokens stored', { personId: person });
}

/**
 * Check if we have a stored refresh token for this person.
 */
export function hasToken(personId) {
  const person = (personId || '').toLowerCase().trim();
  const tokens = loadTokens();
  return !!(tokens[person]?.refresh_token);
}
