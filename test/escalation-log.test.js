import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/escalation-log.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', permissions: ['all'] };

function clearEscalationPatterns() {
  const db = getDb();
  db.prepare('DELETE FROM escalation_patterns').run();
}

beforeEach(() => {
  clearEscalationPatterns();
});

// --- tool definition ---

describe('escalation_log definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('escalation_log');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('action is required', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has add, list, remove', () => {
    const actionEnum = definition.input_schema.properties.action.enum;
    expect(actionEnum).toContain('add');
    expect(actionEnum).toContain('list');
    expect(actionEnum).toContain('remove');
  });
});

// --- add action ---

describe('escalation_log add', () => {
  it('adds a new escalation rule', async () => {
    const result = await execute(
      { action: 'add', pattern: 'legal questions', category: 'legal', reason: 'Tell people to ask Lee directly' },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    expect(result.pattern).toBe('legal questions');
    expect(result.category).toBe('legal');
  });

  it('returns error if pattern missing', async () => {
    const result = await execute({ action: 'add', category: 'legal', reason: 'Ask Lee' }, ENVELOPE);
    expect(result.error).toMatch(/pattern/i);
  });

  it('returns error if category missing', async () => {
    const result = await execute({ action: 'add', pattern: 'legal questions', reason: 'Ask Lee' }, ENVELOPE);
    expect(result.error).toMatch(/category/i);
  });

  it('returns error if reason missing', async () => {
    const result = await execute({ action: 'add', pattern: 'legal questions', category: 'legal' }, ENVELOPE);
    expect(result.error).toMatch(/reason/i);
  });

  it('persists rule to database', async () => {
    await execute(
      { action: 'add', pattern: 'tax advice', category: 'tax', reason: 'Suggest calling Peter at Goldman Sachs' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare("SELECT * FROM escalation_patterns WHERE category = 'tax'").get();
    expect(row).toBeDefined();
    expect(row.pattern).toBe('tax advice');
    expect(row.reason).toBe('Suggest calling Peter at Goldman Sachs');
    expect(row.created_by).toBe('lee');
  });
});

// --- list action ---

describe('escalation_log list', () => {
  it('returns empty list when no rules exist', async () => {
    const result = await execute({ action: 'list' }, ENVELOPE);
    expect(result.rules).toEqual([]);
    expect(result.message).toMatch(/no escalation rules/i);
  });

  it('returns all rules after adding them', async () => {
    await execute({ action: 'add', pattern: 'legal questions', category: 'legal', reason: 'Ask Lee' }, ENVELOPE);
    await execute({ action: 'add', pattern: 'tax advice', category: 'tax', reason: 'Call Peter' }, ENVELOPE);

    const result = await execute({ action: 'list' }, ENVELOPE);
    expect(result.count).toBe(2);
    expect(result.rules.length).toBe(2);

    const categories = result.rules.map((r) => r.category);
    expect(categories).toContain('legal');
    expect(categories).toContain('tax');
  });

  it('includes id, pattern, category, reason in each rule', async () => {
    await execute({ action: 'add', pattern: 'medical diagnosis', category: 'medical', reason: 'Consult a doctor' }, ENVELOPE);
    const result = await execute({ action: 'list' }, ENVELOPE);
    const rule = result.rules[0];
    expect(rule.id).toBeDefined();
    expect(rule.pattern).toBe('medical diagnosis');
    expect(rule.category).toBe('medical');
    expect(rule.reason).toBe('Consult a doctor');
  });
});

// --- remove action ---

describe('escalation_log remove', () => {
  it('removes an existing rule by ID', async () => {
    const added = await execute(
      { action: 'add', pattern: 'legal questions', category: 'legal', reason: 'Ask Lee' },
      ENVELOPE
    );
    const removeResult = await execute({ action: 'remove', id: added.id }, ENVELOPE);
    expect(removeResult.removed).toBe(true);
    expect(removeResult.id).toBe(added.id);

    const listResult = await execute({ action: 'list' }, ENVELOPE);
    expect(listResult.rules).toEqual([]);
  });

  it('returns error if id missing', async () => {
    const result = await execute({ action: 'remove' }, ENVELOPE);
    expect(result.error).toMatch(/id/i);
  });

  it('returns error if rule not found', async () => {
    const result = await execute({ action: 'remove', id: 99999 }, ENVELOPE);
    expect(result.error).toMatch(/not found/i);
  });
});

// --- unknown action ---

describe('escalation_log unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'unknown' }, ENVELOPE);
    expect(result.error).toMatch(/unknown action/i);
  });
});
