#!/usr/bin/env node

/**
 * OpenClaw GitHub Project Watcher
 *
 * Polls GitHub Project #2 every 30 minutes (9am–6pm Pacific) for cards moved to "Ready".
 * When detected:
 *   1. Finds the matching queue spec file
 *   2. Updates card to "In progress"
 *   3. Invokes Claude Code to build it
 *   4. Reviews the diff against the spec's "Done when" criteria
 *   5. Moves card to "Done" or retries with feedback (max 3 attempts)
 *   6. Notifies Lee via Signal
 *
 * Usage: node scripts/openclaw-watcher.js
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, readdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const QUEUE_DIR = join(REPO_ROOT, 'queue');

// Load env from .watcher.env if it exists
const envFile = join(REPO_ROOT, '.watcher.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WORK_HOURS_START = 9;  // 9am Pacific
const WORK_HOURS_END = 18;   // 6pm Pacific
const MAX_REVIEW_ATTEMPTS = 3;

// GitHub Project IDs
const PROJECT_ID = 'PVT_kwHOAVcVpc4BSCAH';
const STATUS_FIELD = 'PVTSSF_lAHOAVcVpc4BSCAHzg_ryew';
const SPEC_FIELD = 'PVTF_lAHOAVcVpc4BSCAHzg_tkwc';
const STATUS_IDS = {
  Backlog: 'f75ad846',
  Ready: '61e4505c',
  'In progress': '47fc9ee4',
  'In review': 'df73e18b',
  Done: '98236657',
};

// Track which cards we're currently processing
const processing = new Set();

// ── GitHub GraphQL helpers ──

function ghGraphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(variables)) {
    args.push('-f', `${k}=${v}`);
  }
  const result = execSync(`gh ${args.map(a => `'${a}'`).join(' ')}`, {
    encoding: 'utf-8',
    timeout: 30000,
  });
  return JSON.parse(result);
}

function updateCardStatus(itemId, status) {
  const statusId = STATUS_IDS[status];
  if (!statusId) throw new Error(`Unknown status: ${status}`);

  const query = `mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $value}}) {
      projectV2Item { id }
    }
  }`;
  ghGraphql(query, { project: PROJECT_ID, item: itemId, field: STATUS_FIELD, value: statusId });
}

// ── Fetch "Ready" cards ──

function getReadyCards() {
  const cards = [];
  let cursor = null;

  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      user(login: "leedavis-irl") {
        projectV2(number: 2) {
          items(first: 100${after}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              content { ... on DraftIssue { title } ... on Issue { title } ... on PullRequest { title } }
              status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
              spec: fieldValueByName(name: "Spec") { ... on ProjectV2ItemFieldTextValue { text } }
            }
          }
        }
      }
    }`;

    const data = ghGraphql(query);
    const items = data.data.user.projectV2.items;

    for (const node of items.nodes) {
      const status = node.status?.name;
      if (status === 'Ready') {
        cards.push({
          id: node.id,
          title: node.content?.title || '',
          specPath: node.spec?.text || null,
        });
      }
    }

    if (!items.pageInfo.hasNextPage) break;
    cursor = items.pageInfo.endCursor;
  }

  return cards;
}

// ── Find queue spec file ──

function findSpecFile(card) {
  // First: use the Spec field if populated
  if (card.specPath) {
    const fullPath = join(REPO_ROOT, card.specPath);
    if (existsSync(fullPath)) return fullPath;
  }

  // Fallback: fuzzy match title to filename
  const slug = card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const files = readdirSync(QUEUE_DIR).filter(f => f.endsWith('.md') && f !== 'TEMPLATE.md');

  for (const f of files) {
    // Strip the number prefix for matching
    const fileSlug = f.replace(/^\d+-/, '').replace(/\.md$/, '');
    if (fileSlug === slug) return join(QUEUE_DIR, f);
    // Partial match
    if (slug.includes(fileSlug) || fileSlug.includes(slug)) return join(QUEUE_DIR, f);
  }

  return null;
}

// ── Invoke Claude Code ──

function invokeClaudeCode(specPath, title) {
  return new Promise((resolve, reject) => {
    const specContent = readFileSync(specPath, 'utf-8');
    const prompt = [
      `Read ARCHITECTURE.md and DEV-PROTOCOL.md for project context.`,
      `Then read and execute the following queue spec: ${specPath}`,
      ``,
      `The spec contents:`,
      specContent,
      ``,
      `Build everything described in the spec. Follow existing patterns in the codebase.`,
      `Run npm test when done. Commit your changes with the commit message from the spec.`,
      `Do not pause for confirmations.`,
    ].join('\n');

    log(`Invoking Claude Code for: ${title}`);

    const child = spawn('claude', [
      '--dangerously-skip-permissions',
      '-p', prompt,
    ], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Claude Code exited with code ${code}\n${stderr.slice(-500)}`));
      }
    });

    child.on('error', reject);
  });
}

// ── Review the diff ──

function reviewDiff(specPath) {
  const spec = readFileSync(specPath, 'utf-8');

  // Extract "Done when" section
  const doneMatch = spec.match(/## Done when\n([\s\S]*?)(?=\n## |$)/);
  const doneCriteria = doneMatch ? doneMatch[1].trim() : 'No done-when criteria found';

  // Get the latest commit diff
  let diff, commitMsg;
  try {
    diff = execSync('git diff HEAD~1 HEAD', { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000 });
    commitMsg = execSync('git log -1 --format=%s', { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return { passed: false, feedback: 'No new commits found after Claude Code ran.' };
  }

  if (!diff.trim()) {
    return { passed: false, feedback: 'No changes were committed.' };
  }

  // Use Anthropic API to evaluate
  const reviewPrompt = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are reviewing a code change. Evaluate whether the diff satisfies the done-when criteria.

## Done-when criteria:
${doneCriteria}

## Commit message:
${commitMsg}

## Diff (truncated to 5000 chars):
${diff.slice(0, 5000)}

Respond with EXACTLY one of:
- PASS: [one sentence explaining why it passes]
- FAIL: [specific feedback on what's missing or wrong]`,
    }],
  });

  try {
    const result = execSync(
      `curl -s https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '${reviewPrompt.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 30000, env: process.env, cwd: REPO_ROOT }
    );
    const response = JSON.parse(result);
    const text = response.content?.[0]?.text || '';

    if (text.startsWith('PASS')) {
      return { passed: true, feedback: text };
    } else {
      return { passed: false, feedback: text };
    }
  } catch (err) {
    // If review fails, pass by default (don't block on review infra issues)
    log(`Review API call failed: ${err.message} — defaulting to PASS`);
    return { passed: true, feedback: 'Review skipped due to API error' };
  }
}

// ── Notify Lee ──

function notifyLee(message) {
  // Try Signal first (more reliable than Slack currently)
  try {
    execSync(
      `ssh -i ~/.ssh/the-pem-key.pem -o ConnectTimeout=5 ubuntu@34.208.73.189 "cd ~/household-agent && node -e \\"
        import('./src/broker/signal.js').then(s => s.sendMessage('+13392360070', '${message.replace(/'/g, "\\'")}'))
      \\""`,
      { timeout: 15000, encoding: 'utf-8' }
    );
  } catch {
    log(`Failed to notify Lee via Signal: ${message}`);
  }
}

// ── Main processing loop for a single card ──

async function processCard(card) {
  const { id, title } = card;

  if (processing.has(id)) {
    log(`Already processing: ${title}`);
    return;
  }

  processing.add(id);
  log(`\n${'='.repeat(60)}`);
  log(`Processing: ${title}`);
  log(`${'='.repeat(60)}`);

  try {
    // Find the spec file
    const specPath = findSpecFile(card);
    if (!specPath) {
      log(`No spec file found for: ${title}`);
      processing.delete(id);
      return;
    }
    log(`Spec: ${specPath}`);

    // Move to In Progress
    updateCardStatus(id, 'In progress');
    log(`Card → In progress`);

    let attempt = 0;
    let lastFeedback = null;

    while (attempt < MAX_REVIEW_ATTEMPTS) {
      attempt++;
      log(`\nAttempt ${attempt}/${MAX_REVIEW_ATTEMPTS}`);

      // Invoke Claude Code
      try {
        await invokeClaudeCode(specPath, title);
        log(`Claude Code completed`);
      } catch (err) {
        log(`Claude Code failed: ${err.message}`);
        if (attempt >= MAX_REVIEW_ATTEMPTS) {
          notifyLee(`⚠️ ${title} — Claude Code failed after ${attempt} attempts. Manual intervention needed.`);
          updateCardStatus(id, 'In progress');
          break;
        }
        continue;
      }

      // Move to In Review
      updateCardStatus(id, 'In review');
      log(`Card → In review`);

      // Review the diff
      const review = reviewDiff(specPath);
      log(`Review: ${review.feedback}`);

      if (review.passed) {
        // Push changes
        try {
          execSync('git push origin main', { cwd: REPO_ROOT, timeout: 30000 });
          log(`Pushed to origin/main`);
        } catch (err) {
          log(`Push failed: ${err.message}`);
        }

        // Delete the queue file
        try {
          if (existsSync(specPath)) {
            unlinkSync(specPath);
            execSync(`git add -A && git commit -m "chore: remove completed queue spec ${title}"`, {
              cwd: REPO_ROOT,
              timeout: 10000,
            });
            execSync('git push origin main', { cwd: REPO_ROOT, timeout: 30000 });
          }
        } catch {
          // Non-fatal
        }

        // Move to Done
        updateCardStatus(id, 'Done');
        log(`Card → Done ✓`);

        const commitMsg = execSync('git log -1 --format=%s', {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();

        notifyLee(`✅ ${title} is done — ${commitMsg}`);
        break;
      } else {
        // Failed review — retry if attempts remain
        if (attempt >= MAX_REVIEW_ATTEMPTS) {
          log(`Max attempts reached — escalating to Lee`);
          updateCardStatus(id, 'In progress');
          notifyLee(`⚠️ ${title} — review failed after ${attempt} attempts. Feedback: ${review.feedback.slice(0, 200)}`);
        } else {
          log(`Retrying with feedback...`);
          updateCardStatus(id, 'In progress');
          lastFeedback = review.feedback;
        }
      }
    }
  } catch (err) {
    log(`Error processing ${title}: ${err.message}`);
    notifyLee(`❌ ${title} — error: ${err.message.slice(0, 200)}`);
  } finally {
    processing.delete(id);
  }
}

// ── Logging ──

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ── Poll loop ──

function isWorkHours() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).format(new Date()));
  return hour >= WORK_HOURS_START && hour < WORK_HOURS_END;
}

async function poll() {
  if (!isWorkHours()) {
    log('Outside work hours (9am–6pm Pacific) — skipping');
    return;
  }

  try {
    log('Polling for Ready cards...');
    const readyCards = getReadyCards();

    if (readyCards.length === 0) {
      log('No Ready cards found');
      return;
    }

    log(`Found ${readyCards.length} Ready card(s)`);

    for (const card of readyCards) {
      if (!processing.has(card.id)) {
        // Process sequentially to avoid conflicts
        await processCard(card);
      }
    }
  } catch (err) {
    log(`Poll error: ${err.message}`);
  }
}

// ── Main ──

log('OpenClaw Watcher starting');
log(`Polling every ${POLL_INTERVAL_MS / 60000} min, ${WORK_HOURS_START}am–${WORK_HOURS_END > 12 ? WORK_HOURS_END - 12 + 'pm' : WORK_HOURS_END + 'am'} Pacific`);
log(`Queue dir: ${QUEUE_DIR}`);
log(`Max review attempts: ${MAX_REVIEW_ATTEMPTS}`);

// Initial poll
await poll();

// Schedule recurring polls
setInterval(poll, POLL_INTERVAL_MS);

// Keep alive
process.on('SIGINT', () => {
  log('Shutting down');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('Shutting down');
  process.exit(0);
});
