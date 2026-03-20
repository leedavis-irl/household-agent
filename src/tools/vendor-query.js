import { getDb } from '../utils/db.js';

export const definition = {
  name: 'vendor_query',
  description:
    "Search the contractor and vendor directory. Look up plumbers, electricians, HVAC techs, landscapers, handymen, and other service providers by trade or name. Returns contact info, rating, and notes from past jobs. Use when someone asks \"who's our plumber?\", \"who did the roof?\", or \"find an electrician\".",
  input_schema: {
    type: 'object',
    properties: {
      trade: {
        type: 'string',
        description: 'Filter by trade (e.g., "plumber", "electrician", "HVAC", "landscaper", "roofer")',
      },
      name: {
        type: 'string',
        description: 'Filter by vendor name or company name (partial match)',
      },
      query: {
        type: 'string',
        description: 'Free-text search across name, trade, and notes (e.g., "panel upgrade", "roof repair")',
      },
      status: {
        type: 'string',
        enum: ['active', 'inactive', 'all'],
        description: 'Filter by status. Defaults to "active".',
      },
    },
  },
};

export async function execute(input) {
  const db = getDb();

  const conditions = [];
  const params = [];

  const statusFilter = input.status || 'active';
  if (statusFilter !== 'all') {
    conditions.push('status = ?');
    params.push(statusFilter);
  }

  if (input.trade) {
    conditions.push('LOWER(trade) LIKE ?');
    params.push(`%${input.trade.toLowerCase()}%`);
  }

  if (input.name) {
    conditions.push('LOWER(name) LIKE ?');
    params.push(`%${input.name.toLowerCase()}%`);
  }

  if (input.query) {
    const q = `%${input.query.toLowerCase()}%`;
    conditions.push('(LOWER(name) LIKE ? OR LOWER(trade) LIKE ? OR LOWER(COALESCE(notes, \'\')) LIKE ?)');
    params.push(q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT id, name, trade, phone, email, rating, notes, last_used, status
       FROM vendors
       ${where}
       ORDER BY rating DESC, name ASC`
    )
    .all(...params);

  if (rows.length === 0) {
    return { vendors: [], message: 'No vendors found matching your search.' };
  }

  return {
    total: rows.length,
    vendors: rows.map((v) => ({
      id: v.id,
      name: v.name,
      trade: v.trade,
      phone: v.phone,
      email: v.email,
      rating: v.rating,
      notes: v.notes,
      last_used: v.last_used,
      status: v.status,
    })),
  };
}
