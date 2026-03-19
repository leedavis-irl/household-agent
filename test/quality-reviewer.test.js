import { describe, it, expect, beforeEach } from 'vitest';
import {
  reviewQuality,
  extractToolResults,
  checkUnacknowledgedToolErrors,
  checkVerbosity,
  checkPotentialHallucination,
} from '../src/utils/quality-reviewer.js';
import { getDb } from '../src/utils/db.js';
import { recordConversationEval } from '../src/utils/eval-logger.js';

// --- helpers ---

function makeEval(overrides = {}) {
  return {
    conversation_id: 'test-conv',
    person_id: 'lee',
    user_message: 'Hi',
    assistant_response: 'Hello!',
    tools_called: '[]',
    ...overrides,
  };
}

function makeToolResultMessage(toolResultContent) {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tu_123',
        content: typeof toolResultContent === 'string'
          ? toolResultContent
          : JSON.stringify(toolResultContent),
      },
    ],
  };
}

function insertEval(evalData) {
  return recordConversationEval({
    conversation_id: evalData.conversation_id ?? 'test-conv',
    person_id: evalData.person_id ?? 'lee',
    user_message: evalData.user_message ?? 'Hi',
    assistant_response: evalData.assistant_response ?? 'Hello!',
    tools_called: JSON.parse(evalData.tools_called ?? '[]'),
  });
}

// --- extractToolResults ---

describe('extractToolResults', () => {
  it('returns empty array when no messages have tool_result blocks', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
    ];
    expect(extractToolResults(messages)).toEqual([]);
  });

  it('extracts content from tool_result blocks', () => {
    const messages = [makeToolResultMessage({ status: 'ok', data: 'test' })];
    const results = extractToolResults(messages);
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0])).toEqual({ status: 'ok', data: 'test' });
  });

  it('extracts multiple tool results across messages', () => {
    const messages = [
      makeToolResultMessage({ result: 'first' }),
      makeToolResultMessage({ result: 'second' }),
    ];
    const results = extractToolResults(messages);
    expect(results).toHaveLength(2);
  });

  it('ignores messages with string content (not arrays)', () => {
    const messages = [{ role: 'user', content: 'plain string' }];
    expect(extractToolResults(messages)).toEqual([]);
  });
});

// --- checkUnacknowledgedToolErrors ---

describe('checkUnacknowledgedToolErrors', () => {
  it('flags when tool returns error and response does not acknowledge', () => {
    const entry = makeEval({ assistant_response: 'The weather is sunny today.' });
    const toolResults = [JSON.stringify({ error: 'HA_TOKEN not set' })];
    const flags = checkUnacknowledgedToolErrors(entry, toolResults);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/tool_error_unacknowledged/);
    expect(flags[0]).toMatch(/HA_TOKEN not set/);
  });

  it('does not flag when response acknowledges the error', () => {
    const entry = makeEval({ assistant_response: 'Sorry, I was unable to retrieve that data.' });
    const toolResults = [JSON.stringify({ error: 'Connection refused' })];
    const flags = checkUnacknowledgedToolErrors(entry, toolResults);
    expect(flags).toHaveLength(0);
  });

  it('does not flag when tool result has no error field', () => {
    const entry = makeEval({ assistant_response: 'Here is your data.' });
    const toolResults = [JSON.stringify({ status: 'ok', temperature: 72 })];
    const flags = checkUnacknowledgedToolErrors(entry, toolResults);
    expect(flags).toHaveLength(0);
  });

  it('does not flag when tool results array is empty', () => {
    const entry = makeEval({ assistant_response: 'Hello!' });
    const flags = checkUnacknowledgedToolErrors(entry, []);
    expect(flags).toHaveLength(0);
  });

  it('does not flag non-JSON tool result strings', () => {
    const entry = makeEval({ assistant_response: 'Done.' });
    const flags = checkUnacknowledgedToolErrors(entry, ['not json at all']);
    expect(flags).toHaveLength(0);
  });

  it('recognizes "failed" in response as acknowledgment', () => {
    const entry = makeEval({ assistant_response: 'The request failed due to a timeout.' });
    const toolResults = [JSON.stringify({ error: 'timeout' })];
    const flags = checkUnacknowledgedToolErrors(entry, toolResults);
    expect(flags).toHaveLength(0);
  });
});

// --- checkVerbosity ---

describe('checkVerbosity', () => {
  it('flags a long response to a short question with no tools', () => {
    const entry = makeEval({
      user_message: 'Hi',
      assistant_response: 'A'.repeat(600),
      tools_called: '[]',
    });
    const flags = checkVerbosity(entry);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/verbose_response/);
  });

  it('does not flag a short response to a short question', () => {
    const entry = makeEval({
      user_message: 'Hi',
      assistant_response: 'Hello there!',
      tools_called: '[]',
    });
    const flags = checkVerbosity(entry);
    expect(flags).toHaveLength(0);
  });

  it('does not flag a long response when tools were called', () => {
    const entry = makeEval({
      user_message: 'Hi',
      assistant_response: 'A'.repeat(600),
      tools_called: '["weather_query"]',
    });
    const flags = checkVerbosity(entry);
    expect(flags).toHaveLength(0);
  });

  it('does not flag a long response to a long question', () => {
    const entry = makeEval({
      user_message: 'Can you give me a detailed summary of everything happening this week?',
      assistant_response: 'A'.repeat(600),
      tools_called: '[]',
    });
    const flags = checkVerbosity(entry);
    expect(flags).toHaveLength(0);
  });
});

// --- checkPotentialHallucination ---

describe('checkPotentialHallucination', () => {
  it('does not flag when no tools were called', () => {
    const entry = makeEval({
      assistant_response: 'The total is $12345.',
      tools_called: '[]',
    });
    const flags = checkPotentialHallucination(entry, []);
    expect(flags).toHaveLength(0);
  });

  it('does not flag when tools were called but no tool results provided', () => {
    const entry = makeEval({
      assistant_response: 'The balance is $5000.',
      tools_called: '["finance_transactions"]',
    });
    const flags = checkPotentialHallucination(entry, []);
    expect(flags).toHaveLength(0);
  });

  it('does not flag when response numbers are present in tool results', () => {
    const entry = makeEval({
      assistant_response: 'Your balance is $1234.56.',
      tools_called: '["finance_accounts"]',
    });
    const toolResults = [JSON.stringify({ balance: 1234.56, account: 'checking' })];
    const flags = checkPotentialHallucination(entry, toolResults);
    expect(flags).toHaveLength(0);
  });

  it('flags when response contains a dollar amount not in tool results', () => {
    const entry = makeEval({
      assistant_response: 'Your balance is $99999.',
      tools_called: '["finance_accounts"]',
    });
    const toolResults = [JSON.stringify({ balance: 500, account: 'checking' })];
    const flags = checkPotentialHallucination(entry, toolResults);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/potential_hallucination/);
    expect(flags[0]).toMatch(/\$99999/);
  });

  it('does not flag conversational numbers below 4 digits', () => {
    const entry = makeEval({
      assistant_response: 'There are 3 events on Thursday.',
      tools_called: '["calendar"]',
    });
    const toolResults = [JSON.stringify({ events: [] })];
    const flags = checkPotentialHallucination(entry, toolResults);
    expect(flags).toHaveLength(0);
  });
});

// --- reviewQuality integration ---

describe('reviewQuality', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM conversation_evals WHERE conversation_id = ?').run('quality-test');
  });

  it('updates quality_notes when tool error is unacknowledged', () => {
    const evalData = makeEval({
      conversation_id: 'quality-test',
      assistant_response: 'The lights are on.',
      tools_called: '["ha_control"]',
    });
    const rowId = insertEval(evalData);

    const messages = [makeToolResultMessage({ error: 'HA_TOKEN not configured' })];
    reviewQuality(evalData, rowId, messages);

    const db = getDb();
    const row = db.prepare('SELECT * FROM conversation_evals WHERE id = ?').get(rowId);
    expect(row.quality_notes).toMatch(/tool_error_unacknowledged/);
    expect(row.failure_category).toBe('tool_error_unacknowledged');
  });

  it('updates quality_notes when response is verbose', () => {
    const evalData = makeEval({
      conversation_id: 'quality-test',
      user_message: 'Hi',
      assistant_response: 'B'.repeat(600),
      tools_called: '[]',
    });
    const rowId = insertEval(evalData);

    reviewQuality(evalData, rowId, []);

    const db = getDb();
    const row = db.prepare('SELECT * FROM conversation_evals WHERE id = ?').get(rowId);
    expect(row.quality_notes).toMatch(/verbose_response/);
    expect(row.failure_category).toBe('verbose_response');
  });

  it('does not update quality_notes when no flags', () => {
    const evalData = makeEval({
      conversation_id: 'quality-test',
      user_message: 'Hi',
      assistant_response: 'Hello!',
      tools_called: '[]',
    });
    const rowId = insertEval(evalData);

    reviewQuality(evalData, rowId, []);

    const db = getDb();
    const row = db.prepare('SELECT * FROM conversation_evals WHERE id = ?').get(rowId);
    expect(row.quality_notes).toBeNull();
    expect(row.failure_category).toBeNull();
  });

  it('handles null rowId gracefully', () => {
    // Should not throw
    expect(() => reviewQuality(makeEval(), null, [])).not.toThrow();
  });

  it('handles missing messages gracefully', () => {
    const evalData = makeEval({ conversation_id: 'quality-test' });
    const rowId = insertEval(evalData);
    // Should not throw
    expect(() => reviewQuality(evalData, rowId)).not.toThrow();
  });
});
