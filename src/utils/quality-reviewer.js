import { getDb } from './db.js';
import log from './logger.js';

/**
 * Extract tool result content strings from a messages array.
 * Tool results appear as user-role messages with content blocks of type 'tool_result'.
 */
function extractToolResults(messages) {
  const results = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'tool_result' && block.content) {
        results.push(block.content);
      }
    }
  }
  return results;
}

/**
 * Check 1: Did any tool return an error that the response didn't acknowledge?
 */
function checkUnacknowledgedToolErrors(evalEntry, toolResultStrings) {
  const flags = [];
  const responseLower = (evalEntry.assistant_response || '').toLowerCase();
  const acknowledgmentWords = [
    'error', 'unable', 'could not', "couldn't", 'failed',
    'not available', 'unavailable', 'sorry', 'issue', 'problem',
  ];
  const responseAcknowledgesError = acknowledgmentWords.some((w) => responseLower.includes(w));

  for (const resultStr of toolResultStrings) {
    try {
      const parsed = JSON.parse(resultStr);
      if (parsed && typeof parsed === 'object' && parsed.error) {
        if (!responseAcknowledgesError) {
          flags.push(`tool_error_unacknowledged: tool returned error "${parsed.error}"`);
          break; // one flag is enough
        }
      }
    } catch {
      // Not JSON — skip
    }
  }

  return flags;
}

/**
 * Check 2: Is the response > 500 chars for a simple question with no tools?
 */
function checkVerbosity(evalEntry) {
  const userLen = (evalEntry.user_message || '').length;
  const responseLen = (evalEntry.assistant_response || '').length;
  const toolsCalled = JSON.parse(evalEntry.tools_called || '[]');

  if (toolsCalled.length === 0 && userLen < 50 && responseLen > 500) {
    return [`verbose_response: ${responseLen}-char response to ${userLen}-char question with no tool calls`];
  }
  return [];
}

/**
 * Check 3: Did the response reference specific data (dollar amounts, large numbers)
 * not present in any tool result?
 */
function checkPotentialHallucination(evalEntry, toolResultStrings) {
  const toolsCalled = JSON.parse(evalEntry.tools_called || '[]');
  if (toolsCalled.length === 0 || toolResultStrings.length === 0) return [];

  const toolText = toolResultStrings.join(' ');
  const response = evalEntry.assistant_response || '';

  // Look for dollar amounts and 4+-digit standalone numbers in the response
  const matches = response.match(/\$[\d,]+(?:\.\d+)?|\b\d{4,}\b/g) || [];

  for (const match of matches) {
    const normalized = match.replace(/[$,]/g, '');
    if (!toolText.includes(normalized) && !toolText.includes(match)) {
      return [`potential_hallucination: "${match}" in response not found in any tool result`];
    }
  }
  return [];
}

/**
 * Run a lightweight quality review on a completed conversation turn.
 *
 * @param {object} evalEntry  - The data object passed to recordConversationEval
 * @param {number} rowId      - The conversation_evals row to update
 * @param {object[]} messages - Full messages array from the brain loop (includes tool results)
 */
export function reviewQuality(evalEntry, rowId, messages = []) {
  try {
    const toolResultStrings = extractToolResults(messages);

    const flags = [
      ...checkUnacknowledgedToolErrors(evalEntry, toolResultStrings),
      ...checkVerbosity(evalEntry),
      ...checkPotentialHallucination(evalEntry, toolResultStrings),
    ];

    if (flags.length === 0) return;

    const qualityNotes = flags.join('; ');
    const failureCategory = flags[0].split(':')[0];

    const db = getDb();
    db.prepare(
      'UPDATE conversation_evals SET quality_notes = ?, failure_category = ? WHERE id = ?'
    ).run(qualityNotes, failureCategory, rowId);

    log.info('Quality flags logged', { rowId, flagCount: flags.length, flags });
  } catch (err) {
    log.warn('Quality review failed', { rowId, error: err.message });
  }
}

// Exported for testing
export { extractToolResults, checkUnacknowledgedToolErrors, checkVerbosity, checkPotentialHallucination };
