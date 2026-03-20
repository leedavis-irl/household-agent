import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/child-tracking.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', person_id: 'lee', permissions: ['all'] };
const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

function clearTracking() {
  const db = getDb();
  db.prepare('DELETE FROM child_tracking').run();
}

beforeEach(() => {
  clearTracking();
});

// --- tool definition ---

describe('child_tracking definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('child_tracking');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('action is required', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has add, query, complete', () => {
    const actionEnum = definition.input_schema.properties.action.enum;
    expect(actionEnum).toContain('add');
    expect(actionEnum).toContain('query');
    expect(actionEnum).toContain('complete');
  });

  it('category enum has homework, medical, permission_slip', () => {
    const catEnum = definition.input_schema.properties.category.enum;
    expect(catEnum).toContain('homework');
    expect(catEnum).toContain('medical');
    expect(catEnum).toContain('permission_slip');
  });
});

// --- add action ---

describe('child_tracking add', () => {
  it('adds a homework entry', async () => {
    const result = await execute(
      { action: 'add', child_id: 'ryker', category: 'homework', title: 'Math worksheet', due_at: FUTURE },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.entry.id).toBeGreaterThan(0);
    expect(result.entry.child_id).toBe('ryker');
    expect(result.entry.category).toBe('homework');
    expect(result.entry.title).toBe('Math worksheet');
  });

  it('adds a medical entry', async () => {
    const dentistDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const result = await execute(
      { action: 'add', child_id: 'hazel', category: 'medical', title: 'Dentist appointment', due_at: dentistDate },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.entry.category).toBe('medical');
    expect(result.entry.due_at_local).toBeTruthy();
    expect(result.entry.reminder_tip).toMatch(/reminder_set/);
  });

  it('adds a permission_slip entry', async () => {
    const result = await execute(
      { action: 'add', child_id: 'logan', category: 'permission_slip', title: 'Field trip form', due_at: FUTURE },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.entry.category).toBe('permission_slip');
  });

  it('persists entry to database', async () => {
    const result = await execute(
      { action: 'add', child_id: 'ryker', category: 'homework', title: 'Science project', due_at: FUTURE },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM child_tracking WHERE id = ?').get(result.entry.id);
    expect(row).toBeDefined();
    expect(row.child_id).toBe('ryker');
    expect(row.title).toBe('Science project');
    expect(row.status).toBe('pending');
    expect(row.created_by).toBe('lee');
  });

  it('accepts entry without due_at', async () => {
    const result = await execute(
      { action: 'add', child_id: 'aj', category: 'homework', title: 'Reading log' },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.entry.due_at).toBeNull();
  });

  it('returns error if child_id missing', async () => {
    const result = await execute({ action: 'add', category: 'homework', title: 'Test' }, ENVELOPE);
    expect(result.error).toMatch(/child_id/i);
  });

  it('returns error if category missing', async () => {
    const result = await execute({ action: 'add', child_id: 'ryker', title: 'Test' }, ENVELOPE);
    expect(result.error).toMatch(/category/i);
  });

  it('returns error if title missing', async () => {
    const result = await execute({ action: 'add', child_id: 'ryker', category: 'homework' }, ENVELOPE);
    expect(result.error).toMatch(/title/i);
  });

  it('returns error for invalid category', async () => {
    const result = await execute(
      { action: 'add', child_id: 'ryker', category: 'random', title: 'Test' },
      ENVELOPE
    );
    expect(result.error).toMatch(/invalid category/i);
  });

  it('returns error for invalid due_at', async () => {
    const result = await execute(
      { action: 'add', child_id: 'ryker', category: 'homework', title: 'Test', due_at: 'not-a-date' },
      ENVELOPE
    );
    expect(result.error).toMatch(/ISO 8601/i);
  });
});

// --- query action ---

describe('child_tracking query', () => {
  beforeEach(async () => {
    await execute({ action: 'add', child_id: 'ryker', category: 'homework', title: 'Math worksheet', due_at: FUTURE }, ENVELOPE);
    await execute({ action: 'add', child_id: 'ryker', category: 'medical', title: 'Dentist', due_at: FUTURE }, ENVELOPE);
    await execute({ action: 'add', child_id: 'logan', category: 'homework', title: 'Book report', due_at: FUTURE }, ENVELOPE);
  });

  it('returns all pending entries by default', async () => {
    const result = await execute({ action: 'query' }, ENVELOPE);
    expect(result.count).toBe(3);
  });

  it('filters by child_id', async () => {
    const result = await execute({ action: 'query', child_id: 'ryker' }, ENVELOPE);
    expect(result.count).toBe(2);
    expect(result.entries.every((e) => e.child_id === 'ryker')).toBe(true);
  });

  it('filters by category', async () => {
    const result = await execute({ action: 'query', category: 'homework' }, ENVELOPE);
    expect(result.count).toBe(2);
    expect(result.entries.every((e) => e.category === 'homework')).toBe(true);
  });

  it('filters by child_id and category', async () => {
    const result = await execute({ action: 'query', child_id: 'ryker', category: 'medical' }, ENVELOPE);
    expect(result.count).toBe(1);
    expect(result.entries[0].title).toBe('Dentist');
  });

  it('returns message when no entries found', async () => {
    const result = await execute({ action: 'query', child_id: 'hazel' }, ENVELOPE);
    expect(result.entries).toEqual([]);
    expect(result.message).toMatch(/no matching entries/i);
  });

  it('includes due_at_local on entries with due dates', async () => {
    const result = await execute({ action: 'query', child_id: 'ryker' }, ENVELOPE);
    expect(result.entries[0].due_at_local).toBeTruthy();
  });
});

// --- complete action ---

describe('child_tracking complete', () => {
  it('marks an entry as completed', async () => {
    const added = await execute(
      { action: 'add', child_id: 'ryker', category: 'homework', title: 'Math worksheet', due_at: FUTURE },
      ENVELOPE
    );
    const result = await execute({ action: 'complete', id: added.entry.id }, ENVELOPE);
    expect(result.completed).toBe(true);
    expect(result.id).toBe(added.entry.id);
    expect(result.title).toBe('Math worksheet');
  });

  it('persists completed status to database', async () => {
    const added = await execute(
      { action: 'add', child_id: 'logan', category: 'permission_slip', title: 'Field trip', due_at: FUTURE },
      ENVELOPE
    );
    await execute({ action: 'complete', id: added.entry.id }, ENVELOPE);

    const db = getDb();
    const row = db.prepare('SELECT * FROM child_tracking WHERE id = ?').get(added.entry.id);
    expect(row.status).toBe('completed');
    expect(row.completed_at).toBeTruthy();
  });

  it('completed items excluded from default pending query', async () => {
    const added = await execute(
      { action: 'add', child_id: 'ryker', category: 'homework', title: 'Math worksheet', due_at: FUTURE },
      ENVELOPE
    );
    await execute({ action: 'complete', id: added.entry.id }, ENVELOPE);

    const result = await execute({ action: 'query', child_id: 'ryker' }, ENVELOPE);
    expect(result.entries).toEqual([]);
  });

  it('returns error if id missing', async () => {
    const result = await execute({ action: 'complete' }, ENVELOPE);
    expect(result.error).toMatch(/id/i);
  });

  it('returns error if entry not found', async () => {
    const result = await execute({ action: 'complete', id: 99999 }, ENVELOPE);
    expect(result.error).toMatch(/not found/i);
  });
});

// --- unknown action ---

describe('child_tracking unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'unknown' }, ENVELOPE);
    expect(result.error).toMatch(/unknown action/i);
  });
});
