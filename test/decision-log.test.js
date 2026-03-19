import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/decision-log.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', permissions: [] };

function clearDecisions() {
  const db = getDb();
  db.prepare('DELETE FROM decisions').run();
}

beforeEach(() => {
  clearDecisions();
});

// --- definition ---

describe('decision_log tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('decision_log');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires action', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has record and search', () => {
    const actionProp = definition.input_schema.properties.action;
    expect(actionProp.enum).toContain('record');
    expect(actionProp.enum).toContain('search');
  });

  it('category enum has all five categories', () => {
    const categoryProp = definition.input_schema.properties.category;
    expect(categoryProp.enum).toContain('education');
    expect(categoryProp.enum).toContain('finance');
    expect(categoryProp.enum).toContain('home');
    expect(categoryProp.enum).toContain('health');
    expect(categoryProp.enum).toContain('logistics');
  });
});

// --- record ---

describe('record action', () => {
  it('stores a decision and returns recorded: true', async () => {
    const result = await execute(
      {
        action: 'record',
        title: 'Kept Ryker at John Muir Elementary',
        description: 'Chose to keep Ryker at John Muir for the 2026-27 school year',
        rationale: 'Strong 504 support team, familiar environment, proximity to home',
        alternatives_considered: 'Considered Peralta Elementary and private school options',
        participants: ['lee', 'hallie'],
        category: 'education',
      },
      ENVELOPE
    );
    expect(result.recorded).toBe(true);
    expect(typeof result.id).toBe('number');
    expect(result.title).toBe('Kept Ryker at John Muir Elementary');
    expect(result.category).toBe('education');
  });

  it('stores without optional fields', async () => {
    const result = await execute(
      {
        action: 'record',
        title: 'Switched to community solar',
        rationale: 'Lower rates than PG&E, community benefit',
        category: 'finance',
      },
      ENVELOPE
    );
    expect(result.recorded).toBe(true);
    expect(typeof result.id).toBe('number');
  });

  it('returns error when title is missing', async () => {
    const result = await execute(
      { action: 'record', rationale: 'Some reason', category: 'home' },
      ENVELOPE
    );
    expect(result.error).toMatch(/title/);
  });

  it('returns error when rationale is missing', async () => {
    const result = await execute(
      { action: 'record', title: 'Some decision', category: 'home' },
      ENVELOPE
    );
    expect(result.error).toMatch(/rationale/);
  });

  it('returns error when category is missing', async () => {
    const result = await execute(
      { action: 'record', title: 'Some decision', rationale: 'Some reason' },
      ENVELOPE
    );
    expect(result.error).toMatch(/category/);
  });

  it('returns error for invalid category', async () => {
    const result = await execute(
      { action: 'record', title: 'Some decision', rationale: 'Some reason', category: 'hobbies' },
      ENVELOPE
    );
    expect(result.error).toMatch(/Invalid category/);
  });

  it('records decided_by from envelope', async () => {
    await execute(
      { action: 'record', title: 'Test', rationale: 'Test rationale', category: 'logistics' },
      { person: 'hallie', permissions: [] }
    );
    const db = getDb();
    const row = db.prepare('SELECT decided_by FROM decisions WHERE title = ?').get('Test');
    expect(row.decided_by).toBe('hallie');
  });
});

// --- search ---

describe('search action', () => {
  it('returns empty results when no decisions exist', async () => {
    const result = await execute({ action: 'search' }, ENVELOPE);
    expect(result.results).toEqual([]);
    expect(result.message).toMatch(/No decisions/);
  });

  it('finds decisions by keyword in title', async () => {
    await execute(
      { action: 'record', title: 'Switched to community solar', rationale: 'Cost savings', category: 'finance' },
      ENVELOPE
    );
    const result = await execute({ action: 'search', query: 'solar' }, ENVELOPE);
    expect(result.count).toBe(1);
    expect(result.results[0].title).toBe('Switched to community solar');
  });

  it('finds decisions by keyword in rationale', async () => {
    await execute(
      { action: 'record', title: 'Kept Ryker at John Muir', rationale: '504 support team is excellent', category: 'education' },
      ENVELOPE
    );
    const result = await execute({ action: 'search', query: '504' }, ENVELOPE);
    expect(result.count).toBe(1);
    expect(result.results[0].rationale).toMatch(/504/);
  });

  it('filters by category', async () => {
    await execute(
      { action: 'record', title: 'Education decision', rationale: 'School reasons', category: 'education' },
      ENVELOPE
    );
    await execute(
      { action: 'record', title: 'Finance decision', rationale: 'Money reasons', category: 'finance' },
      ENVELOPE
    );

    const result = await execute({ action: 'search', category: 'education' }, ENVELOPE);
    expect(result.count).toBe(1);
    expect(result.results[0].category).toBe('education');
  });

  it('filters by category and keyword together', async () => {
    await execute(
      { action: 'record', title: 'Chose public school', rationale: 'Better 504 support', category: 'education' },
      ENVELOPE
    );
    await execute(
      { action: 'record', title: 'Chose budget laptop', rationale: 'Cost under budget', category: 'finance' },
      ENVELOPE
    );

    const result = await execute({ action: 'search', query: 'chose', category: 'education' }, ENVELOPE);
    expect(result.count).toBe(1);
    expect(result.results[0].title).toMatch(/public school/);
  });

  it('each result includes all expected fields', async () => {
    await execute(
      {
        action: 'record',
        title: 'Kept Ryker at John Muir',
        description: 'Full description',
        rationale: 'Strong support',
        alternatives_considered: 'Private school',
        participants: ['lee', 'hallie'],
        category: 'education',
      },
      ENVELOPE
    );

    const result = await execute({ action: 'search', category: 'education' }, ENVELOPE);
    const entry = result.results[0];
    expect(entry.id).toBeDefined();
    expect(entry.title).toBe('Kept Ryker at John Muir');
    expect(entry.description).toBe('Full description');
    expect(entry.rationale).toBe('Strong support');
    expect(entry.alternatives_considered).toBe('Private school');
    expect(Array.isArray(entry.participants)).toBe(true);
    expect(entry.participants).toContain('lee');
    expect(entry.participants).toContain('hallie');
    expect(entry.decided_by).toBe('lee');
    expect(entry.decided_at).toBeDefined();
    expect(entry.category).toBe('education');
    expect(entry.status).toBe('active');
  });

  it('search is case-insensitive', async () => {
    await execute(
      { action: 'record', title: 'Chose Public School', rationale: 'Good support', category: 'education' },
      ENVELOPE
    );
    const result = await execute({ action: 'search', query: 'public school' }, ENVELOPE);
    expect(result.count).toBe(1);
  });
});

// --- unknown action ---

describe('unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'forget_everything' }, ENVELOPE);
    expect(result.error).toMatch(/Unknown action/);
  });
});
