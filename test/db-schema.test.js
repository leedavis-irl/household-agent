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
    ];
    for (const t of expected) {
      expect(tables, `missing table: ${t}`).toContain(t);
    }
  });
});
