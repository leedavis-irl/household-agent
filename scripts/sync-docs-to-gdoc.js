#!/usr/bin/env node
/**
 * Sync Iji's family-facing .md files to a single Google Doc.
 *
 * Usage: node scripts/sync-docs-to-gdoc.js
 *
 * - Includes: root-level .md files + docs/*.md (alphabetically each).
 * - Excludes: node_modules/, specs/, config/ (by only reading root and docs/).
 * - Replaces the entire Google Doc body with intro + concatenated markdown.
 * - Tracks content hash in .last-docs-hash; if changed, sends Signal notification.
 *
 * Config (config/household.json):
 *   google_docs.family_doc_id — ID of the existing Google Doc (shared with service account as Editor).
 *   google_docs.signal_group_id — (optional) Signal group ID to notify when content changes.
 *
 * Requires: config/google-service-account.json with Docs API enabled in the project.
 * Cron: run weekly (e.g. Sunday 18:00). See docs/docs-sync.md.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'household.json');
const CREDENTIALS_PATH = join(PROJECT_ROOT, 'config', 'google-service-account.json');
const HASH_FILE = join(PROJECT_ROOT, '.last-docs-hash');

const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
const DOC_BASE_URL = 'https://docs.google.com/document/d/';

function log(level, msg, data = {}) {
  const line = { time: new Date().toISOString(), level, msg, ...data };
  console.log(JSON.stringify(line));
}

function getMdFiles() {
  const rootFiles = readdirSync(PROJECT_ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(PROJECT_ROOT, e.name))
    .sort();
  const docsDir = join(PROJECT_ROOT, 'docs');
  let docsFiles = [];
  if (existsSync(docsDir)) {
    docsFiles = readdirSync(docsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => join(docsDir, e.name))
      .sort();
  }
  return { root: rootFiles, docs: docsFiles };
}

function buildContent(files) {
  const intro = [
    'This document is automatically assembled from Iji\'s project files. It is regenerated periodically and should not be edited directly. The contents are pulled from the following locations in order: root-level .md files (alphabetically), then docs/ .md files (alphabetically).',
    `Last updated: ${new Date().toISOString()}.`,
  ].join(' ');
  const parts = [intro];
  for (const filePath of files) {
    const name = filePath.startsWith(join(PROJECT_ROOT, 'docs'))
      ? `docs/${filePath.slice(join(PROJECT_ROOT, 'docs').length + 1)}`
      : filePath.slice(PROJECT_ROOT.length + 1);
    parts.push('\n\n— Source: ' + name + ' —\n\n');
    parts.push(readFileSync(filePath, 'utf-8'));
  }
  return parts.join('');
}

function getHouseholdConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found: ${CONFIG_PATH}`);
  }
  const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  return data;
}

function getPreviousHash() {
  if (!existsSync(HASH_FILE)) return null;
  return readFileSync(HASH_FILE, 'utf-8').trim() || null;
}

function saveHash(hash) {
  writeFileSync(HASH_FILE, hash, 'utf-8');
}

function sendSignalNotification(groupId, text) {
  const signalCli = process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli';
  const account = process.env.SIGNAL_ACCOUNT;
  if (!account) {
    log('warn', 'SIGNAL_ACCOUNT not set, skipping Signal notification');
    return;
  }
  try {
    const r = spawnSync(signalCli, ['-a', account, 'send', '-g', groupId, '--', text], {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    if (r.status !== 0) {
      log('error', 'Signal send failed', { stderr: r.stderr?.slice(0, 500), status: r.status });
      return;
    }
    log('info', 'Signal notification sent', { groupId });
  } catch (err) {
    log('error', 'Signal send failed', { error: err.message });
  }
}

async function getDocsClient() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error('Google service account not found: ' + CREDENTIALS_PATH);
  }
  const { google } = await import('googleapis');
  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DOCS_SCOPE],
  });
  return google.docs({ version: 'v1', auth });
}

async function replaceDocContent(docs, documentId, fullText) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data.body;
  if (!body?.content?.length) {
    throw new Error('Document has no body content');
  }
  const last = body.content[body.content.length - 1];
  const endIndex = last.endIndex;
  const requests = [];
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

async function main() {
  const config = getHouseholdConfig();
  const familyDocId = config.google_docs?.family_doc_id;
  if (!familyDocId) {
    log('error', 'google_docs.family_doc_id not set in config/household.json');
    process.exit(1);
  }

  const { root: rootFiles, docs: docsFiles } = getMdFiles();
  const allFiles = [...rootFiles, ...docsFiles];
  const fileNames = allFiles.map((f) => f.slice(PROJECT_ROOT.length + 1));
  log('info', 'Files included', { files: fileNames });

  if (allFiles.length === 0) {
    log('info', 'No .md files found in root or docs/');
    process.exit(0);
  }

  const fullText = buildContent(allFiles);
  const newHash = createHash('sha256').update(fullText).digest('hex');
  const previousHash = getPreviousHash();

  const docs = await getDocsClient();
  await replaceDocContent(docs, familyDocId, fullText);
  log('info', 'Doc updated', { documentId: familyDocId });

  const changed = previousHash === null || previousHash !== newHash;
  saveHash(newHash);

  if (changed) {
    log('info', 'Content changed; notification sent', { previousHash: previousHash?.slice(0, 8), newHash: newHash.slice(0, 8) });
    const groupId = config.google_docs?.signal_group_id;
    if (groupId) {
      const url = DOC_BASE_URL + familyDocId;
      const message = `📄 Iji's docs have been updated. Here's the link: ${url} Take a look when you have a chance.`;
      sendSignalNotification(groupId, message);
    } else {
      log('info', 'No google_docs.signal_group_id set; skip Signal notification');
    }
  } else {
    log('info', 'No content change; no notification', { hash: newHash.slice(0, 8) });
  }
}

main().catch((err) => {
  log('error', 'sync-docs-to-gdoc failed', { error: err.message });
  process.exit(1);
});
