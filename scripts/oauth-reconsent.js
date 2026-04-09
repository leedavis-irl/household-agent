#!/usr/bin/env node
/**
 * One-off OAuth re-consent for Lee with Gmail + Drive + Sheets scopes.
 *
 * Disposable script — bypasses the household.json requirement of
 * scripts/gmail-auth.js because this Mac doesn't have a household.json.
 *
 * Usage: node scripts/oauth-reconsent.js
 * Prereqs: config/google-oauth-credentials.json must exist.
 */
import { createServer } from 'http';
import {
  getAuthUrl,
  handleCallback,
  getClient,
  ALL_GOOGLE_SCOPES,
} from '../src/utils/google-oauth.js';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const PERSON_ID = 'lee';

async function main() {
  const url = await getAuthUrl(PERSON_ID, ALL_GOOGLE_SCOPES, {
    redirectUri: REDIRECT_URI,
  });

  const codePromise = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url || '/', `http://localhost:${PORT}`);
      if (u.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found.');
        return;
      }
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end(`<p style="font-family:sans-serif;color:#c00;">Auth failed: ${error}. ${u.searchParams.get('error_description') || ''}</p>`);
        resolve({ error });
      } else if (code) {
        res.end('<p style="font-family:sans-serif;">Authorization successful. You can close this tab and return to the terminal.</p>');
        resolve({ code });
      } else {
        res.end('<p style="font-family:sans-serif;color:#c00;">No code in redirect.</p>');
        resolve({ error: 'no_code' });
      }
      server.close();
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log('\n=====================================================');
      console.log('1. Open this URL in your browser:');
      console.log('\n' + url + '\n');
      console.log('2. Sign in as Lee, approve the scopes (Gmail + Drive + Sheets).');
      console.log('3. You will see an "unverified app" warning — click Advanced, then proceed.');
      console.log('4. Google will redirect to localhost and this script will finish automatically.');
      console.log('=====================================================\n');
    });

    server.on('error', reject);
  });

  const result = await codePromise;
  if (result.error) {
    console.error('\nFAILED:', result.error);
    if (result.error === 'no_code') {
      console.error('Google did not send a code back. If redirect_uri_mismatch, the script is using:', REDIRECT_URI);
    }
    process.exit(1);
  }

  console.log('Got auth code, exchanging for tokens...');
  await handleCallback(PERSON_ID, result.code, ALL_GOOGLE_SCOPES, {
    redirectUri: REDIRECT_URI,
  });
  console.log('Tokens stored in data/oauth-tokens.json');

  // Verify with a quick Sheets API call
  console.log('Verifying Sheets scope with a read test...');
  const client = await getClient(PERSON_ID, ALL_GOOGLE_SCOPES);
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth: client });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo',
    fields: 'properties.title,sheets.properties.title',
  });
  console.log('\nSUCCESS. Spreadsheet:', meta.data.properties.title);
  console.log('Tabs:');
  for (const s of meta.data.sheets || []) {
    console.log('  -', s.properties.title);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
