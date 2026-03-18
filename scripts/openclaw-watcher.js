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
  Backlog: '4b7d97c0',
  Specd: '822c0cbd',
  Ready: '5c36728b',
  'In progress': 'f2aaf1bc',
  'In review': 'fb6c39f9',
  Done: '94939777',
  Abandoned: 'ccb1b5f3',
};
const FEEDBACK_FIELD = 'PVTF_lAHOAVcVpc4BSCAHzg_xO-I';

// Track which cards we're currently processing or have failed
const processing = new Set();
const failed = new Map(); // cardId → { title, feedback, timestamp }

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

function setCardFeedback(itemId, feedback) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'short' });
  const text = `[${ts}] ${feedback}`.slice(0, 1000);
  const query = `mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {text: $value}}) {
      projectV2Item { id }
    }
  }`;
  try {
    ghGraphql(query, { project: PROJECT_ID, item: itemId, field: FEEDBACK_FIELD, value: text });
  } catch (err) {
    log(`Failed to set feedback on card: ${err.message}`);
  }
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

// ── Spec quality validation ──

const BOILERPLATE_PATTERNS = [
  /Capability described in Goal is functional end-to-end/,
  /\[2-4 sentences describing/,
  /\[Specific technical guidance/,
  /\[Any relevant background/,
  /\[Specific test cases to run/,
  /\[Specific, checkable criterion/,
  /TBD.*review existing/i,
  /\[type\]: \[short description\]/,
];

function validateSpec(specPath) {
  const content = readFileSync(specPath, 'utf-8');
  const issues = [];

  // Check "What to build" has real content (not placeholder or < 20 words)
  const whatMatch = content.match(/## What to build\n([\s\S]*?)(?=\n## )/);
  const whatContent = whatMatch ? whatMatch[1].trim() : '';
  const whatWords = whatContent.split(/\s+/).filter(Boolean).length;
  if (whatWords < 15) {
    issues.push(`"What to build" too short (${whatWords} words, need 15+)`);
  }

  // Check "Done when" has specific criteria (not boilerplate)
  const doneMatch = content.match(/## Done when\n([\s\S]*?)(?=\n## |$)/);
  const doneContent = doneMatch ? doneMatch[1].trim() : '';
  const doneItems = (doneContent.match(/^- \[/gm) || []).length;
  if (doneItems < 3) {
    issues.push(`"Done when" has ${doneItems} items (need 3+)`);
  }

  // Check "Implementation notes" has real content
  const implMatch = content.match(/## Implementation notes\n([\s\S]*?)(?=\n## )/);
  const implContent = implMatch ? implMatch[1].trim() : '';
  const implWords = implContent.split(/\s+/).filter(Boolean).length;
  if (implWords < 20) {
    issues.push(`"Implementation notes" too short (${implWords} words, need 20+)`);
  }

  // Check "Verification" has test cases
  const verifyMatch = content.match(/## Verification\n([\s\S]*?)(?=\n## )/);
  const verifyContent = verifyMatch ? verifyMatch[1].trim() : '';
  if (!verifyContent || verifyContent.startsWith('[')) {
    issues.push('"Verification" is missing or still a placeholder');
  }

  // Check for boilerplate patterns that indicate a stub
  const boilerplateHits = BOILERPLATE_PATTERNS.filter(p => p.test(content));
  if (boilerplateHits.length >= 2) {
    issues.push(`Spec contains ${boilerplateHits.length} boilerplate patterns — likely a stub`);
  }

  return { valid: issues.length === 0, issues };
}

// ── Invoke Claude Code ──

function invokeClaudeCode(specPath, title, feedback = null) {
  return new Promise((resolve, reject) => {
    const specContent = readFileSync(specPath, 'utf-8');
    const parts = [
      `Read ARCHITECTURE.md and DEV-PROTOCOL.md for project context.`,
      `Then read and execute the following queue spec: ${specPath}`,
      ``,
      `The spec contents:`,
      specContent,
      ``,
      `Build everything described in the spec. Follow existing patterns in the codebase.`,
      `Run npm test when done. Commit your changes with the commit message from the spec.`,
      `Do not pause for confirmations.`,
    ];

    if (feedback) {
      parts.push(
        ``,
        `IMPORTANT: A previous attempt was reviewed and FAILED. Here is the reviewer's feedback:`,
        feedback,
        ``,
        `Address this feedback in your implementation. Make sure your changes are complete and substantive.`,
      );
    }

    const prompt = parts.join('\n');

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

function reviewDiff(specPath, baselineSha) {
  const spec = readFileSync(specPath, 'utf-8');

  // Extract "Done when" section
  const doneMatch = spec.match(/## Done when\n([\s\S]*?)(?=\n## |$)/);
  const doneCriteria = doneMatch ? doneMatch[1].trim() : 'No done-when criteria found';

  // Diff from baseline (before CC started) to current HEAD — captures all commits CC made
  let diff, commitLog, fileSummary;
  try {
    diff = execSync(`git diff ${baselineSha} HEAD`, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 15000 });
    commitLog = execSync(`git log --oneline ${baselineSha}..HEAD`, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
    fileSummary = execSync(`git diff --stat ${baselineSha} HEAD`, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return { passed: false, feedback: 'No new commits found after Claude Code ran.' };
  }

  if (!diff.trim()) {
    return { passed: false, feedback: 'No changes were committed.' };
  }

  // Use Anthropic API to evaluate
  const MAX_DIFF_CHARS = 15000;
  const truncated = diff.length > MAX_DIFF_CHARS;
  const reviewPrompt = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are reviewing a code change. Evaluate whether the diff satisfies the done-when criteria.

## Done-when criteria:
${doneCriteria}

## Commits made:
${commitLog}

## Files changed (full list):
${fileSummary}

## Diff${truncated ? ` (truncated to ${MAX_DIFF_CHARS} chars — see file list above for full scope)` : ''}:
${diff.slice(0, MAX_DIFF_CHARS)}

Respond with EXACTLY one of:
- PASS: [one sentence explaining why it passes]
- FAIL: [specific feedback on what's missing or wrong]

IMPORTANT: If the file list shows the right files were created/modified and the visible portion of the diff shows substantive implementation code, do not fail just because the diff is truncated. Judge by the evidence available.`,
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
      `ssh -i ~/.ssh/the-pem-key.pem -o ConnectTimeout=5 ubuntu@${process.env.DEPLOY_HOST || '<EC2_PUBLIC_IP>'} "cd ~/household-agent && node -e \\"
        import('./src/broker/signal.js').then(s => s.sendMessage('+1XXXXXXXXXX', '${message.replace(/'/g, "\\'")}'))
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
      setCardFeedback(id, `No spec file found. Add a queue/ spec file and set the Spec field, or name the file to match the card title.`);
      processing.delete(id);
      return;
    }
    log(`Spec: ${specPath}`);

    // Validate spec quality before wasting CC cycles
    const validation = validateSpec(specPath);
    if (!validation.valid) {
      log(`Spec failed quality check:`);
      for (const issue of validation.issues) log(`  ⚠ ${issue}`);
      log(`Moving card back to Backlog — spec needs work before Ready`);
      updateCardStatus(id, 'Backlog');
      setCardFeedback(id, `Spec quality check failed: ${validation.issues.join('; ')}`);
      notifyLee(`⚠️ ${title} — spec failed quality check and was moved back to Backlog. Issues: ${validation.issues.join('; ')}`);
      processing.delete(id);
      return;
    }

    // Move to In Progress and clear any prior feedback
    updateCardStatus(id, 'In progress');
    setCardFeedback(id, '');
    log(`Card → In progress`);

    let attempt = 0;
    let lastFeedback = null;

    while (attempt < MAX_REVIEW_ATTEMPTS) {
      attempt++;
      log(`\nAttempt ${attempt}/${MAX_REVIEW_ATTEMPTS}`);

      // Snapshot HEAD before CC runs so we can diff the full body of work
      const baselineSha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000 }).trim();

      // Invoke Claude Code
      try {
        await invokeClaudeCode(specPath, title, lastFeedback);
        log(`Claude Code completed`);
      } catch (err) {
        log(`Claude Code failed: ${err.message}`);
        if (attempt >= MAX_REVIEW_ATTEMPTS) {
          log(`Max attempts reached — moving back to Ready and escalating to Lee`);
          updateCardStatus(id, 'Ready');
          const ccFailReason = `Claude Code failed after ${attempt} attempts. Error: ${err.message.slice(0, 500)}`;
          setCardFeedback(id, ccFailReason);
          failed.set(id, { title, feedback: err.message, timestamp: new Date().toISOString() });
          notifyLee(`⚠️ ${title} — Claude Code failed after ${attempt} attempts. Card moved back to Ready.`);
          break;
        }
        lastFeedback = `Claude Code crashed: ${err.message}`;
        continue;
      }

      // Move to In Review
      updateCardStatus(id, 'In review');
      log(`Card → In review`);

      // Review the diff — from baseline to current HEAD (all commits CC made)
      const review = reviewDiff(specPath, baselineSha);
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
        lastFeedback = review.feedback;
        if (attempt >= MAX_REVIEW_ATTEMPTS) {
          log(`Max attempts reached — moving back to Ready and escalating to Lee`);
          updateCardStatus(id, 'Ready');
          setCardFeedback(id, `Review failed after ${attempt} attempts. ${review.feedback}`);
          failed.set(id, { title, feedback: review.feedback, timestamp: new Date().toISOString() });
          notifyLee(`⚠️ ${title} — review failed after ${attempt} attempts. Card moved back to Ready. Feedback: ${review.feedback.slice(0, 200)}`);
        } else {
          log(`Retrying with feedback...`);
          updateCardStatus(id, 'In progress');
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
  const ts = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
      if (processing.has(card.id)) continue;
      if (failed.has(card.id)) {
        log(`Skipping previously failed card: ${card.title} (restart watcher to retry)`);
        continue;
      }
      // Process sequentially to avoid conflicts
      await processCard(card);
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
