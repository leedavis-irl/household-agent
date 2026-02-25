import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import log from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../../data/iji.db');
const seedPath = join(__dirname, '../../data/knowledge.json');

let db;

export function getDb() {
  if (db) return db;

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Run migrations
  migrate(db);

  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      reported_at TEXT NOT NULL,
      expires_at TEXT,
      tags TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_groups (
      group_id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      person_id TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      estimated_cost_usd REAL NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_usage_timestamp ON claude_usage(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_usage_person ON claude_usage(person_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      target_person_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      fire_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      fired_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_fire_at ON reminders(fire_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status)`);

  const seedGroup = db.prepare(
    'INSERT OR IGNORE INTO signal_groups (group_id, group_name) VALUES (?, ?)'
  );
  seedGroup.run('wABSnPZyvqntyh5NdUSwgNGcCBXCpeuEAYZUoAGchsM=', 'Avalon Logistics');

  // Seed from JSON if table is empty and seed file exists
  const count = db.prepare('SELECT COUNT(*) as n FROM knowledge').get();
  if (count.n === 0 && existsSync(seedPath)) {
    log.info('Seeding knowledge database from knowledge.json');
    const entries = JSON.parse(readFileSync(seedPath, 'utf-8'));
    const insert = db.prepare(
      'INSERT INTO knowledge (content, reported_by, reported_at, expires_at, tags) VALUES (?, ?, ?, ?, ?)'
    );
    for (const entry of entries) {
      insert.run(
        entry.content,
        entry.reported_by,
        entry.reported_at,
        entry.expires_at || null,
        JSON.stringify(entry.tags || [])
      );
    }
  }
}
