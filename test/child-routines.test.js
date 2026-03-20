import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/child-routines.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', person_id: 'lee', permissions: ['all'] };
const TODAY = new Date().toISOString().slice(0, 10);

function clearRoutines() {
  const db = getDb();
  db.prepare('DELETE FROM child_routines').run();
}

beforeEach(() => {
  clearRoutines();
});

// --- tool definition ---

describe('child_routines definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('child_routines');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('action is required', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has check_off, query, add_item, reset', () => {
    const actionEnum = definition.input_schema.properties.action.enum;
    expect(actionEnum).toContain('check_off');
    expect(actionEnum).toContain('query');
    expect(actionEnum).toContain('add_item');
    expect(actionEnum).toContain('reset');
  });
});

// --- query action ---

describe('child_routines query', () => {
  it('returns message when no data for a child', async () => {
    const result = await execute({ action: 'query', child_id: 'ryker', date: '2025-01-01' }, ENVELOPE);
    expect(result.routines).toBeDefined();
    expect(result.message).toMatch(/no routine data/i);
  });

  it('auto-initializes morning items for today when queried', async () => {
    const result = await execute({ action: 'query', child_id: 'ryker', period: 'morning' }, ENVELOPE);
    expect(result.routines).toBeDefined();
    expect(result.routines['ryker']).toBeDefined();
    const { items } = result.routines['ryker'];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.completed === 0)).toBe(true);
  });

  it('includes brush_teeth in morning defaults', async () => {
    await execute({ action: 'query', child_id: 'logan', period: 'morning' }, ENVELOPE);
    const db = getDb();
    const row = db.prepare("SELECT * FROM child_routines WHERE child_id='logan' AND item='brush_teeth' AND date=?").get(TODAY);
    expect(row).toBeDefined();
  });

  it('returns summary with total and done counts', async () => {
    const result = await execute({ action: 'query', child_id: 'hazel', period: 'morning' }, ENVELOPE);
    const summary = result.routines['hazel'];
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.done).toBe(0);
    expect(summary.outstanding).toBe(summary.total);
  });
});

// --- check_off action ---

describe('child_routines check_off', () => {
  it('marks an item as completed', async () => {
    await execute({ action: 'add_item', child_id: 'ryker', item: 'brush_teeth', period: 'morning' }, ENVELOPE);
    const result = await execute(
      { action: 'check_off', child_id: 'ryker', item: 'brush_teeth', period: 'morning', completed_by: 'lee' },
      ENVELOPE
    );
    expect(result.checked_off).toBe(true);
    expect(result.child_id).toBe('ryker');
    expect(result.item).toBe('brush_teeth');
  });

  it('persists completion to database', async () => {
    await execute({ action: 'add_item', child_id: 'logan', item: 'reading', period: 'evening' }, ENVELOPE);
    await execute(
      { action: 'check_off', child_id: 'logan', item: 'reading', period: 'evening' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare(
      "SELECT * FROM child_routines WHERE child_id='logan' AND item='reading' AND period='evening' AND date=?"
    ).get(TODAY);
    expect(row.completed).toBe(1);
    expect(row.completed_at).toBeTruthy();
  });

  it('auto-inserts item if not present before checking off', async () => {
    const result = await execute(
      { action: 'check_off', child_id: 'aj', item: 'brush_teeth', period: 'morning' },
      ENVELOPE
    );
    expect(result.checked_off).toBe(true);
    const db = getDb();
    const row = db.prepare(
      "SELECT * FROM child_routines WHERE child_id='aj' AND item='brush_teeth' AND date=?"
    ).get(TODAY);
    expect(row).toBeDefined();
    expect(row.completed).toBe(1);
  });

  it('returns error if child_id missing', async () => {
    const result = await execute({ action: 'check_off', item: 'brush_teeth' }, ENVELOPE);
    expect(result.error).toMatch(/child_id/i);
  });

  it('returns error if item missing', async () => {
    const result = await execute({ action: 'check_off', child_id: 'ryker' }, ENVELOPE);
    expect(result.error).toMatch(/item/i);
  });

  it('reflects completion in subsequent query', async () => {
    await execute({ action: 'check_off', child_id: 'alex', item: 'brush_teeth', period: 'morning' }, ENVELOPE);
    const result = await execute({ action: 'query', child_id: 'alex', period: 'morning' }, ENVELOPE);
    const summary = result.routines['alex'];
    const brushRow = summary.items.find((i) => i.item === 'brush_teeth');
    expect(brushRow.completed).toBe(1);
    expect(summary.done).toBeGreaterThanOrEqual(1);
  });
});

// --- add_item action ---

describe('child_routines add_item', () => {
  it('adds a custom item to a child\'s routine', async () => {
    const result = await execute(
      { action: 'add_item', child_id: 'ryker', item: 'take_vitamins', period: 'morning' },
      ENVELOPE
    );
    expect(result.added).toBe(true);
    expect(result.item).toBe('take_vitamins');
  });

  it('returns message if item already exists', async () => {
    await execute({ action: 'add_item', child_id: 'ryker', item: 'take_vitamins', period: 'morning' }, ENVELOPE);
    const result = await execute({ action: 'add_item', child_id: 'ryker', item: 'take_vitamins', period: 'morning' }, ENVELOPE);
    expect(result.added).toBe(false);
    expect(result.message).toMatch(/already exists/i);
  });

  it('returns error if child_id missing', async () => {
    const result = await execute({ action: 'add_item', item: 'take_vitamins' }, ENVELOPE);
    expect(result.error).toMatch(/child_id/i);
  });

  it('returns error if item missing', async () => {
    const result = await execute({ action: 'add_item', child_id: 'ryker' }, ENVELOPE);
    expect(result.error).toMatch(/item/i);
  });
});

// --- reset action ---

describe('child_routines reset', () => {
  it('clears completions for a child', async () => {
    await execute({ action: 'check_off', child_id: 'ryker', item: 'brush_teeth', period: 'morning' }, ENVELOPE);
    const resetResult = await execute({ action: 'reset', child_id: 'ryker' }, ENVELOPE);
    expect(resetResult.reset).toBe(true);

    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM child_routines WHERE child_id='ryker' AND date=? AND completed=1"
    ).all(TODAY);
    expect(rows.length).toBe(0);
  });

  it('resets all children when no child_id given', async () => {
    await execute({ action: 'check_off', child_id: 'ryker', item: 'brush_teeth', period: 'morning' }, ENVELOPE);
    await execute({ action: 'check_off', child_id: 'logan', item: 'brush_teeth', period: 'morning' }, ENVELOPE);

    const resetResult = await execute({ action: 'reset' }, ENVELOPE);
    expect(resetResult.reset).toBe(true);
    expect(resetResult.all_children).toBe(true);

    const db = getDb();
    const rows = db.prepare("SELECT * FROM child_routines WHERE date=? AND completed=1").all(TODAY);
    expect(rows.length).toBe(0);
  });
});

// --- unknown action ---

describe('child_routines unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'unknown' }, ENVELOPE);
    expect(result.error).toMatch(/unknown action/i);
  });
});
