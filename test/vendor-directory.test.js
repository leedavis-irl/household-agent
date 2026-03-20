import { describe, it, expect, beforeEach } from 'vitest';
import { definition as queryDef, execute as queryExecute } from '../src/tools/vendor-query.js';
import { definition as storeDef, execute as storeExecute } from '../src/tools/vendor-store.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = { person: 'lee', permissions: ['vendor_directory'] };

function clearVendors() {
  const db = getDb();
  db.prepare('DELETE FROM vendors').run();
}

beforeEach(() => {
  clearVendors();
});

// --- tool definitions ---

describe('vendor_query definition', () => {
  it('has correct name', () => {
    expect(queryDef.name).toBe('vendor_query');
  });

  it('has a description', () => {
    expect(typeof queryDef.description).toBe('string');
    expect(queryDef.description.length).toBeGreaterThan(0);
  });

  it('status enum has active, inactive, all', () => {
    const statusEnum = queryDef.input_schema.properties.status.enum;
    expect(statusEnum).toContain('active');
    expect(statusEnum).toContain('inactive');
    expect(statusEnum).toContain('all');
  });
});

describe('vendor_store definition', () => {
  it('has correct name', () => {
    expect(storeDef.name).toBe('vendor_store');
  });

  it('requires action', () => {
    expect(storeDef.input_schema.required).toContain('action');
  });

  it('action enum has add and update', () => {
    const actionEnum = storeDef.input_schema.properties.action.enum;
    expect(actionEnum).toContain('add');
    expect(actionEnum).toContain('update');
  });
});

// --- vendor_store: add ---

describe('vendor_store add action', () => {
  it('adds a vendor and returns stored: true', async () => {
    const result = await storeExecute(
      { action: 'add', name: "Bay Area Plumbing", trade: 'plumber', phone: '(510) 555-1000' },
      ENVELOPE
    );
    expect(result.stored).toBe(true);
    expect(typeof result.id).toBe('number');
    expect(result.name).toBe('Bay Area Plumbing');
    expect(result.trade).toBe('plumber');
  });

  it('adds vendor with all fields', async () => {
    const result = await storeExecute(
      {
        action: 'add',
        name: "Mike's Electric",
        trade: 'electrician',
        phone: '(510) 555-1234',
        email: 'mike@mikeselectric.com',
        rating: 5,
        notes: 'Great work on panel upgrade, very reliable',
        last_used: '2025-06',
        status: 'active',
      },
      ENVELOPE
    );
    expect(result.stored).toBe(true);

    const db = getDb();
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.id);
    expect(row.name).toBe("Mike's Electric");
    expect(row.trade).toBe('electrician');
    expect(row.phone).toBe('(510) 555-1234');
    expect(row.email).toBe('mike@mikeselectric.com');
    expect(row.rating).toBe(5);
    expect(row.notes).toMatch(/panel upgrade/);
    expect(row.last_used).toBe('2025-06');
    expect(row.status).toBe('active');
    expect(row.added_by).toBe('lee');
  });

  it('returns error when name is missing', async () => {
    const result = await storeExecute({ action: 'add', trade: 'plumber' }, ENVELOPE);
    expect(result.error).toMatch(/name/);
  });

  it('returns error when trade is missing', async () => {
    const result = await storeExecute({ action: 'add', name: 'Acme Co' }, ENVELOPE);
    expect(result.error).toMatch(/trade/);
  });

  it('defaults status to active', async () => {
    const result = await storeExecute(
      { action: 'add', name: 'Reliable HVAC', trade: 'HVAC' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare('SELECT status FROM vendors WHERE id = ?').get(result.id);
    expect(row.status).toBe('active');
  });
});

// --- vendor_store: update ---

describe('vendor_store update action', () => {
  it('updates an existing vendor', async () => {
    const add = await storeExecute(
      { action: 'add', name: 'Old Plumbing Co', trade: 'plumber', phone: '(510) 555-0001' },
      ENVELOPE
    );

    const result = await storeExecute(
      { action: 'update', id: add.id, phone: '(510) 555-9999', rating: 4, notes: 'Fixed the kitchen sink' },
      ENVELOPE
    );
    expect(result.updated).toBe(true);
    expect(result.id).toBe(add.id);

    const db = getDb();
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(add.id);
    expect(row.phone).toBe('(510) 555-9999');
    expect(row.rating).toBe(4);
    expect(row.notes).toBe('Fixed the kitchen sink');
    expect(row.name).toBe('Old Plumbing Co'); // unchanged
  });

  it('returns error when id is missing', async () => {
    const result = await storeExecute({ action: 'update', name: 'New Name' }, ENVELOPE);
    expect(result.error).toMatch(/id/);
  });

  it('returns error when vendor id not found', async () => {
    const result = await storeExecute({ action: 'update', id: 99999, name: 'Ghost' }, ENVELOPE);
    expect(result.error).toMatch(/No vendor found/);
  });
});

// --- vendor_store: unknown action ---

describe('vendor_store unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await storeExecute({ action: 'delete' }, ENVELOPE);
    expect(result.error).toMatch(/Unknown action/);
  });
});

// --- vendor_query ---

describe('vendor_query', () => {
  beforeEach(async () => {
    await storeExecute(
      { action: 'add', name: "Bay Area Plumbing", trade: 'plumber', phone: '(510) 555-1000', rating: 4, notes: 'Fixed burst pipe in basement' },
      ENVELOPE
    );
    await storeExecute(
      { action: 'add', name: "Mike's Electric", trade: 'electrician', phone: '(510) 555-1234', rating: 5, notes: 'Panel upgrade, very professional' },
      ENVELOPE
    );
    await storeExecute(
      { action: 'add', name: 'Green Thumb Landscaping', trade: 'landscaper', phone: '(510) 555-2000', rating: 3, status: 'inactive' },
      ENVELOPE
    );
  });

  it('returns empty when no vendors match', async () => {
    const result = await queryExecute({ trade: 'roofer' });
    expect(result.vendors).toEqual([]);
    expect(result.message).toMatch(/No vendors found/);
  });

  it('searches by trade', async () => {
    const result = await queryExecute({ trade: 'plumber' });
    expect(result.total).toBe(1);
    expect(result.vendors[0].name).toBe('Bay Area Plumbing');
  });

  it('searches by trade (case-insensitive)', async () => {
    const result = await queryExecute({ trade: 'Electrician' });
    expect(result.total).toBe(1);
    expect(result.vendors[0].name).toBe("Mike's Electric");
  });

  it('searches by name (partial match)', async () => {
    const result = await queryExecute({ name: 'mike' });
    expect(result.total).toBe(1);
    expect(result.vendors[0].trade).toBe('electrician');
  });

  it('free-text search finds vendor by notes', async () => {
    const result = await queryExecute({ query: 'panel upgrade', status: 'all' });
    expect(result.total).toBe(1);
    expect(result.vendors[0].name).toBe("Mike's Electric");
  });

  it('free-text search finds vendor by trade', async () => {
    const result = await queryExecute({ query: 'plumb', status: 'all' });
    expect(result.total).toBeGreaterThan(0);
    expect(result.vendors.some((v) => v.trade === 'plumber')).toBe(true);
  });

  it('defaults to active-only results', async () => {
    const result = await queryExecute({});
    expect(result.vendors.every((v) => v.status === 'active')).toBe(true);
    expect(result.vendors.some((v) => v.name === 'Green Thumb Landscaping')).toBe(false);
  });

  it('status=all returns inactive vendors too', async () => {
    const result = await queryExecute({ status: 'all' });
    expect(result.vendors.some((v) => v.name === 'Green Thumb Landscaping')).toBe(true);
  });

  it('returns all expected fields', async () => {
    const result = await queryExecute({ trade: 'plumber' });
    const v = result.vendors[0];
    expect(v.id).toBeDefined();
    expect(v.name).toBeDefined();
    expect(v.trade).toBeDefined();
    expect(v.phone).toBeDefined();
    expect('rating' in v).toBe(true);
    expect('notes' in v).toBe(true);
    expect('last_used' in v).toBe(true);
    expect(v.status).toBeDefined();
  });

  it('orders by rating descending', async () => {
    const result = await queryExecute({ status: 'active' });
    const ratings = result.vendors.map((v) => v.rating).filter((r) => r !== null);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i - 1]).toBeGreaterThanOrEqual(ratings[i]);
    }
  });
});

// --- db migration ---

describe('vendors table schema', () => {
  it('vendors table exists with expected columns', () => {
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
