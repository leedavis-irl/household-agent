import { getDb } from './db.js';
import log from './logger.js';

/**
 * Record one completed brain loop into conversation_evals.
 * @param {object} entry
 * @param {string} entry.conversation_id
 * @param {string} entry.person_id
 * @param {string} entry.user_message
 * @param {string} entry.assistant_response
 * @param {string[]} [entry.tools_called]
 * @param {string[]|null} [entry.capabilities_loaded]
 * @param {object[]|null} [entry.layer_tokens] - per-layer token breakdown
 * @param {number} [entry.prompt_tokens]
 * @param {number} [entry.completion_tokens]
 * @param {number} [entry.total_cost_usd]
 * @param {number} [entry.response_time_ms]
 */
export function recordConversationEval(entry) {
  const conversationId = entry.conversation_id ?? 'unknown';
  const personId = entry.person_id ?? 'unknown';

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO conversation_evals
        (conversation_id, person_id, user_message, assistant_response, tools_called, capabilities_loaded, layer_tokens, prompt_tokens, completion_tokens, total_cost_usd, response_time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      conversationId,
      personId,
      entry.user_message ?? '',
      entry.assistant_response ?? '',
      JSON.stringify(entry.tools_called ?? []),
      entry.capabilities_loaded ? JSON.stringify(entry.capabilities_loaded) : null,
      entry.layer_tokens ? JSON.stringify(entry.layer_tokens) : null,
      entry.prompt_tokens ?? null,
      entry.completion_tokens ?? null,
      entry.total_cost_usd ?? null,
      entry.response_time_ms ?? null
    );
  } catch (err) {
    log.warn('Failed to record conversation eval', {
      conversation_id: conversationId,
      person_id: personId,
      error: err.message,
    });
  }
}
