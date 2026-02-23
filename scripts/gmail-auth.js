#!/usr/bin/env node
/**
 * One-time Gmail OAuth setup for a household member.
 * Usage: node scripts/gmail-auth.js <person-id>
 *
 * 1. Starts a temporary HTTP server on localhost (port 3000 by default)
 * 2. Prints the auth URL (redirect_uri = http://localhost:3000/callback)
 * 3. User opens URL, authorizes; Google redirects to localhost with the code
 * 4. Server captures the code, exchanges it for tokens, stores them, then exits
 * 5. Verifies with a test Gmail API call
 *
 * Add http://localhost:3000/callback to your OAuth client's "Authorized redirect URIs" in Google Cloud Console.
 */
import { createServer } from 'http';
import { loadConfig, getHousehold } from '../src/utils/config.js';
import { getAuthUrl, handleCallback, getClient, hasToken } from '../src/utils/google-oauth.js';

const PORT = parseInt(process.env.GMAIL_AUTH_PORT || '3000', 10);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const personId = process.argv[2]?.trim()?.toLowerCase();
if (!personId) {
  console.error('Usage: node scripts/gmail-auth.js <person-id>');
  console.error('Example: node scripts/gmail-auth.js lee');
  process.exit(1);
}

async function main() {
  loadConfig();
  const household = getHousehold();
  if (!household.members[personId]) {
    console.error(`Unknown person-id: ${personId}. Valid: ${Object.keys(household.members).join(', ')}`);
    process.exit(1);
  }

  if (hasToken(personId)) {
    console.log(`Tokens already exist for ${personId}. Re-authorizing will replace them.`);
  }

  const url = await getAuthUrl(personId, undefined, { redirectUri: REDIRECT_URI });

  const codePromise = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Use the /callback path after authorizing.');
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const successHtml = `
        <!DOCTYPE html>
        <html><head><title>Gmail auth</title></head>
        <body>
          <p style="font-family:sans-serif;">Authorization successful. You can close this window and return to the terminal.</p>
        </body></html>`;
      const errorHtml = (msg) => `
        <!DOCTYPE html>
        <html><head><title>Gmail auth</title></head>
        <body>
          <p style="font-family:sans-serif;color:#c00;">${msg}</p>
        </body></html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end(errorHtml(`Authorization failed: ${error}. ${url.searchParams.get('error_description') || ''}`));
        resolve({ error });
      } else if (code) {
        res.end(successHtml);
        resolve({ code });
      } else {
        res.end(errorHtml('No code in redirect. Try again.'));
        resolve({ error: 'no_code' });
      }
      server.close();
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`\n1. Open this URL in your browser (redirect: ${REDIRECT_URI}):\n`);
      console.log(url);
      console.log('\n2. Waiting for you to complete sign-in in the browser…\n');
    });

    server.on('error', (err) => {
      reject(err);
    });
  });

  const result = await codePromise;
  if (result.error) {
    if (result.error === 'no_code') {
      console.error('No auth code received. Make sure the redirect URI in Google Cloud Console is exactly:', REDIRECT_URI);
    } else {
      console.error('Authorization failed:', result.error);
    }
    process.exit(1);
  }

  await handleCallback(personId, result.code, undefined, { redirectUri: REDIRECT_URI });
  console.log('Tokens stored.\n3. Verifying with Gmail API...');

  const client = await getClient(personId);
  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`OK. Gmail profile: ${profile.data.emailAddress} (${profile.data.messagesTotal} messages).`);
  console.log('\nDone. You can now use email_search and email_read for this user.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
