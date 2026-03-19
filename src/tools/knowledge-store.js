import { getDb } from '../utils/db.js';

const TTL_TIERS = {
  ephemeral: 7,      // 1 week
  short: 30,         // 1 month
  medium: 180,       // 6 months
  permanent: null,   // no expiry
};

function expiresAtFromTier(tier) {
  const days = TTL_TIERS[tier];
  if (days === null || days === undefined) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const definition = {
  name: 'knowledge_store',
  description:
    'Store a new piece of household knowledge. Use this when someone tells you information worth remembering — dinner plans, appointments, household events, etc. Always set ttl_tier based on how long the fact will remain relevant.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The information to store',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorizing the knowledge (e.g., "dinner", "schedule", "maintenance")',
      },
      ttl_tier: {
        type: 'string',
        enum: ['ephemeral', 'short', 'medium', 'permanent'],
        description:
          'Time-to-live tier for this knowledge. ephemeral = 1 week (single events like dinner plans), short = 1 month (near-term logistics), medium = 6 months (semester-length facts, seasonal items), permanent = never expires (allergies, house rules, standing preferences).',
      },
      expires_at: {
        type: 'string',
        description:
          'Optional ISO 8601 expiry datetime override. If omitted, expires_at is derived from ttl_tier. Provide this only when you need a precise expiry that does not match a tier.',
      },
    },
    required: ['content', 'ttl_tier'],
  },
};

export async function execute(input, envelope) {
  const db = getDb();

  let expiresAt = input.expires_at || null;
  if (!expiresAt && input.ttl_tier) {
    expiresAt = expiresAtFromTier(input.ttl_tier);
  }

  const result = db
    .prepare(
      'INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      input.content,
      envelope.person,
      new Date().toISOString(),
      expiresAt,
      JSON.stringify(input.tags || [])
    );

  return { stored: true, id: result.lastInsertRowid, ttl_tier: input.ttl_tier, expires_at: expiresAt };
}
