import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/feedback-log.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', permissions: [] };

function clearFeedback() {
  const db = getDb();
  db.prepare("DELETE FROM knowledge WHERE LOWER(COALESCE(tags,'')) LIKE '%suggestion-feedback%'").run();
}

beforeEach(() => {
  clearFeedback();
});

// --- definition ---

describe('feedback_log tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('feedback_log');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires action and topic', () => {
    expect(definition.input_schema.required).toContain('action');
    expect(definition.input_schema.required).toContain('topic');
  });

  it('action enum has record and query', () => {
    const actionProp = definition.input_schema.properties.action;
    expect(actionProp.enum).toContain('record');
    expect(actionProp.enum).toContain('query');
  });
});

// --- record ---

describe('record action', () => {
  it('stores feedback and returns recorded: true', async () => {
    const result = await execute(
      { action: 'record', topic: 'restaurants', subject: 'Chez Panisse', rating: 5, notes: 'Incredible tasting menu' },
      ENVELOPE,
    );
    expect(result.recorded).toBe(true);
    expect(typeof result.id).toBe('number');
    expect(result.summary).toMatch(/Chez Panisse/);
    expect(result.summary).toMatch(/5\/5/);
  });

  it('includes notes in summary', async () => {
    const result = await execute(
      { action: 'record', topic: 'restaurants', subject: 'Bad Diner', rating: 1, notes: 'Cold food, rude staff' },
      ENVELOPE,
    );
    expect(result.summary).toMatch(/Cold food/);
  });

  it('works without notes', async () => {
    const result = await execute(
      { action: 'record', topic: 'activities', subject: 'Tilden hiking', rating: 4 },
      ENVELOPE,
    );
    expect(result.recorded).toBe(true);
    expect(result.summary).toMatch(/4\/5/);
  });

  it('returns error when subject is missing', async () => {
    const result = await execute({ action: 'record', topic: 'restaurants', rating: 3 }, ENVELOPE);
    expect(result.error).toMatch(/subject/);
  });

  it('returns error when rating is missing', async () => {
    const result = await execute({ action: 'record', topic: 'restaurants', subject: 'Some Place' }, ENVELOPE);
    expect(result.error).toMatch(/rating/);
  });

  it('returns error when rating is out of range', async () => {
    const result = await execute(
      { action: 'record', topic: 'restaurants', subject: 'Some Place', rating: 6 },
      ENVELOPE,
    );
    expect(result.error).toMatch(/rating/);
  });

  it('returns error when rating is below 1', async () => {
    const result = await execute(
      { action: 'record', topic: 'restaurants', subject: 'Some Place', rating: 0 },
      ENVELOPE,
    );
    expect(result.error).toMatch(/rating/);
  });
});

// --- query ---

describe('query action', () => {
  it('returns empty results when no feedback exists', async () => {
    const result = await execute({ action: 'query', topic: 'restaurants' }, ENVELOPE);
    expect(result.results).toEqual([]);
    expect(result.message).toMatch(/No feedback/);
  });

  it('returns recorded feedback by topic', async () => {
    await execute(
      { action: 'record', topic: 'restaurants', subject: 'Chez Panisse', rating: 5 },
      ENVELOPE,
    );
    await execute(
      { action: 'record', topic: 'restaurants', subject: 'Bad Diner', rating: 1, notes: 'Terrible' },
      ENVELOPE,
    );

    const result = await execute({ action: 'query', topic: 'restaurants' }, ENVELOPE);
    expect(result.count).toBe(2);
    expect(result.results.some((r) => r.content.includes('Chez Panisse'))).toBe(true);
    expect(result.results.some((r) => r.content.includes('Bad Diner'))).toBe(true);
  });

  it('does not return feedback for a different topic', async () => {
    await execute(
      { action: 'record', topic: 'restaurants', subject: 'Chez Panisse', rating: 5 },
      ENVELOPE,
    );

    const result = await execute({ action: 'query', topic: 'activities' }, ENVELOPE);
    expect(result.results).toEqual([]);
  });

  it('each result includes id, content, reported_by, reported_at, tags', async () => {
    await execute(
      { action: 'record', topic: 'restaurants', subject: 'Test Place', rating: 3 },
      ENVELOPE,
    );

    const result = await execute({ action: 'query', topic: 'restaurants' }, ENVELOPE);
    const entry = result.results[0];
    expect(entry.id).toBeDefined();
    expect(typeof entry.content).toBe('string');
    expect(entry.reported_by).toBe('lee');
    expect(entry.reported_at).toBeDefined();
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(entry.tags).toContain('feedback');
    expect(entry.tags).toContain('suggestion-feedback');
    expect(entry.tags).toContain('restaurants');
  });
});

// --- unknown action ---

describe('unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'forget_everything', topic: 'restaurants' }, ENVELOPE);
    expect(result.error).toMatch(/Unknown action/);
  });
});
