import { describe, it, expect, beforeEach } from 'vitest';
import { definition, execute } from '../src/tools/knowledge-store.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', permissions: [] };

function clearKnowledge() {
  const db = getDb();
  db.prepare('DELETE FROM knowledge WHERE reported_by = ?').run('lee');
}

beforeEach(() => {
  clearKnowledge();
});

// --- definition ---

describe('knowledge_store tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('knowledge_store');
  });

  it('requires content and ttl_tier', () => {
    expect(definition.input_schema.required).toContain('content');
    expect(definition.input_schema.required).toContain('ttl_tier');
  });

  it('ttl_tier enum has all four tiers', () => {
    const tiers = definition.input_schema.properties.ttl_tier.enum;
    expect(tiers).toContain('ephemeral');
    expect(tiers).toContain('short');
    expect(tiers).toContain('medium');
    expect(tiers).toContain('permanent');
  });
});

// --- TTL tier logic ---

describe('TTL tier expiry calculation', () => {
  it('ephemeral tier sets expires_at ~7 days from now', async () => {
    const before = new Date();
    const result = await execute({ content: 'Dinner at Chez Panisse on Friday', ttl_tier: 'ephemeral' }, ENVELOPE);
    const after = new Date();

    expect(result.stored).toBe(true);
    expect(result.ttl_tier).toBe('ephemeral');
    expect(result.expires_at).not.toBeNull();

    const expiresAt = new Date(result.expires_at);
    const minExpected = new Date(before.getTime() + 6 * 24 * 60 * 60 * 1000);
    const maxExpected = new Date(after.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(expiresAt >= minExpected).toBe(true);
    expect(expiresAt <= maxExpected).toBe(true);
  });

  it('short tier sets expires_at ~30 days from now', async () => {
    const before = new Date();
    const result = await execute({ content: 'Pool service starts next month', ttl_tier: 'short' }, ENVELOPE);
    const after = new Date();

    expect(result.stored).toBe(true);
    const expiresAt = new Date(result.expires_at);
    const minExpected = new Date(before.getTime() + 29 * 24 * 60 * 60 * 1000);
    const maxExpected = new Date(after.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(expiresAt >= minExpected).toBe(true);
    expect(expiresAt <= maxExpected).toBe(true);
  });

  it('medium tier sets expires_at ~180 days from now', async () => {
    const before = new Date();
    const result = await execute({ content: "Ryker's spring soccer season schedule", ttl_tier: 'medium' }, ENVELOPE);
    const after = new Date();

    expect(result.stored).toBe(true);
    const expiresAt = new Date(result.expires_at);
    const minExpected = new Date(before.getTime() + 179 * 24 * 60 * 60 * 1000);
    const maxExpected = new Date(after.getTime() + 181 * 24 * 60 * 60 * 1000);
    expect(expiresAt >= minExpected).toBe(true);
    expect(expiresAt <= maxExpected).toBe(true);
  });

  it('permanent tier sets expires_at to null', async () => {
    const result = await execute({ content: 'Ryker is allergic to peanuts', ttl_tier: 'permanent' }, ENVELOPE);
    expect(result.stored).toBe(true);
    expect(result.expires_at).toBeNull();
    expect(result.ttl_tier).toBe('permanent');
  });

  it('explicit expires_at override takes precedence over ttl_tier', async () => {
    const overrideDate = '2099-01-01T00:00:00.000Z';
    const result = await execute(
      { content: 'Custom expiry test', ttl_tier: 'ephemeral', expires_at: overrideDate },
      ENVELOPE
    );
    expect(result.stored).toBe(true);
    expect(result.expires_at).toBe(overrideDate);
  });

  it('stores expires_at in the database for ephemeral entries', async () => {
    const result = await execute({ content: 'Dinner at 7pm tonight', ttl_tier: 'ephemeral' }, ENVELOPE);
    const db = getDb();
    const row = db.prepare('SELECT expires_at FROM knowledge WHERE id = ?').get(result.id);
    expect(row.expires_at).not.toBeNull();
  });

  it('stores null expires_at in the database for permanent entries', async () => {
    const result = await execute({ content: 'House rule: shoes off at the door', ttl_tier: 'permanent' }, ENVELOPE);
    const db = getDb();
    const row = db.prepare('SELECT expires_at FROM knowledge WHERE id = ?').get(result.id);
    expect(row.expires_at).toBeNull();
  });

  it('returns stored: true and a numeric id', async () => {
    const result = await execute({ content: 'Test entry', ttl_tier: 'short' }, ENVELOPE);
    expect(result.stored).toBe(true);
    expect(typeof result.id).toBe('number');
  });
});

// --- cleanup job ---

describe('knowledge expiry cleanup', () => {
  it('deletes entries whose expires_at is in the past', async () => {
    const db = getDb();
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const ins = db
      .prepare('INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)')
      .run('Expired fact', 'lee', new Date().toISOString(), pastDate, '[]');
    const id = ins.lastInsertRowid;

    // Simulate the cleanup
    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM knowledge WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowIso);

    const row = db.prepare('SELECT id FROM knowledge WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('does not delete entries whose expires_at is in the future', async () => {
    const db = getDb();
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const ins = db
      .prepare('INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)')
      .run('Future fact', 'lee', new Date().toISOString(), futureDate, '[]');
    const id = ins.lastInsertRowid;

    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM knowledge WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowIso);

    const row = db.prepare('SELECT id FROM knowledge WHERE id = ?').get(id);
    expect(row).toBeDefined();

    // cleanup
    db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
  });

  it('does not delete permanent entries (expires_at IS NULL)', async () => {
    const result = await execute({ content: 'Ryker is allergic to peanuts', ttl_tier: 'permanent' }, ENVELOPE);
    const db = getDb();

    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM knowledge WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowIso);

    const row = db.prepare('SELECT id FROM knowledge WHERE id = ?').get(result.id);
    expect(row).toBeDefined();
  });
});
