import { describe, it, expect } from 'vitest';
import { getDb, getSchemaVersion } from '../src/utils/db.js';

describe('schema version tracking', () => {
  it('schema_versions table exists', () => {
    const db = getDb();
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'"
    ).get();
    expect(table).toBeDefined();
    expect(table.name).toBe('schema_versions');
  });

  it('getSchemaVersion returns a positive integer', () => {
    const version = getSchemaVersion();
    expect(Number.isInteger(version)).toBe(true);
    expect(version).toBeGreaterThanOrEqual(1);
  });

  it('schema_versions has expected columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(schema_versions)').all();
    const names = cols.map((c) => c.name);
    expect(names).toContain('version');
    expect(names).toContain('description');
    expect(names).toContain('applied_at');
  });

  it('baseline migration (v1) is recorded', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM schema_versions WHERE version = 1').get();
    expect(row).toBeDefined();
    expect(row.description).toMatch(/baseline/i);
    expect(row.applied_at).toBeTruthy();
  });

  it('all expected tables exist after migration', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map((r) => r.name);
    const expected = [
      'knowledge', 'signal_groups', 'claude_usage', 'reminders',
      'conversation_evals', 'feature_requests', 'tasks', 'schema_versions',
      'briefing_preferences', 'decisions', 'vendors',
    ];
    for (const t of expected) {
      expect(tables, `missing table: ${t}`).toContain(t);
    }
  });

  it('decisions table has correct columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(decisions)').all().map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('title');
    expect(cols).toContain('rationale');
    expect(cols).toContain('alternatives_considered');
    expect(cols).toContain('participants');
    expect(cols).toContain('decided_by');
    expect(cols).toContain('decided_at');
    expect(cols).toContain('category');
    expect(cols).toContain('status');
  });

  it('migration v4 (decisions table) is recorded in schema_versions', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM schema_versions WHERE version = 4').get();
    expect(row).toBeDefined();
    expect(row.description).toMatch(/decisions/i);
    expect(row.applied_at).toBeTruthy();
  });

  it('migration v5 (vendors table) is recorded in schema_versions', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM schema_versions WHERE version = 5').get();
    expect(row).toBeDefined();
    expect(row.description).toMatch(/vendor/i);
    expect(row.applied_at).toBeTruthy();
  });

  it('vendors table has correct columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(vendors)').all().map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('trade');
    expect(cols).toContain('phone');
    expect(cols).toContain('email');
    expect(cols).toContain('rating');
    expect(cols).toContain('notes');
    expect(cols).toContain('last_used');
    expect(cols).toContain('status');
    expect(cols).toContain('added_by');
    expect(cols).toContain('added_at');
  });
});
