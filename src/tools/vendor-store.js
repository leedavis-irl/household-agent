import { getDb } from '../utils/db.js';

const VALID_STATUSES = ['active', 'inactive'];

export const definition = {
  name: 'vendor_store',
  description:
    'Add a new vendor/contractor to the directory, or update an existing one. Use this when someone provides contractor contact info or wants to record a vendor. Examples: "Add Mike\'s Electric — (510) 555-1234, great work on the panel upgrade" or "Update the plumber\'s rating to 5 stars".',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'update'],
        description: 'add: create a new vendor record; update: modify an existing vendor by id',
      },
      id: {
        type: 'number',
        description: 'For update: the vendor id to update',
      },
      name: {
        type: 'string',
        description: 'Vendor or company name (e.g., "Mike\'s Electric", "Bay Area Plumbing")',
      },
      trade: {
        type: 'string',
        description: 'The trade or service category (e.g., "electrician", "plumber", "HVAC", "landscaper", "roofer", "handyman")',
      },
      phone: {
        type: 'string',
        description: 'Phone number',
      },
      email: {
        type: 'string',
        description: 'Email address',
      },
      rating: {
        type: 'number',
        description: 'Rating from 1 to 5 (5 = excellent)',
      },
      notes: {
        type: 'string',
        description: 'Notes from past jobs — what work was done, how it went, any caveats',
      },
      last_used: {
        type: 'string',
        description: 'Date last used (ISO 8601 or natural date like "2025-11")',
      },
      status: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'active (default) or inactive (no longer using this vendor)',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  if (input.action === 'add') {
    if (!input.name) return { error: 'add action requires a name' };
    if (!input.trade) return { error: 'add action requires a trade' };

    const status = input.status || 'active';
    if (!VALID_STATUSES.includes(status)) {
      return { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` };
    }

    const result = db
      .prepare(
        `INSERT INTO vendors (name, trade, phone, email, rating, notes, last_used, status, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name,
        input.trade,
        input.phone || null,
        input.email || null,
        input.rating || null,
        input.notes || null,
        input.last_used || null,
        status,
        envelope?.person || 'unknown',
        new Date().toISOString()
      );

    return {
      stored: true,
      id: result.lastInsertRowid,
      name: input.name,
      trade: input.trade,
    };
  }

  if (input.action === 'update') {
    if (!input.id) return { error: 'update action requires an id' };

    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(input.id);
    if (!existing) return { error: `No vendor found with id ${input.id}` };

    if (input.status && !VALID_STATUSES.includes(input.status)) {
      return { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` };
    }

    const updated = {
      name: input.name ?? existing.name,
      trade: input.trade ?? existing.trade,
      phone: input.phone ?? existing.phone,
      email: input.email ?? existing.email,
      rating: input.rating ?? existing.rating,
      notes: input.notes ?? existing.notes,
      last_used: input.last_used ?? existing.last_used,
      status: input.status ?? existing.status,
    };

    db.prepare(
      `UPDATE vendors SET name=?, trade=?, phone=?, email=?, rating=?, notes=?, last_used=?, status=? WHERE id=?`
    ).run(
      updated.name,
      updated.trade,
      updated.phone,
      updated.email,
      updated.rating,
      updated.notes,
      updated.last_used,
      updated.status,
      input.id
    );

    return {
      updated: true,
      id: input.id,
      name: updated.name,
      trade: updated.trade,
    };
  }

  return { error: `Unknown action: ${input.action}. Use add or update.` };
}
