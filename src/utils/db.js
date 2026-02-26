import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import log from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../../data/iji.db');
const seedPath = join(__dirname, '../../data/knowledge.json');

let db;

function ensureColumn(db, tableName, columnName, definitionSql) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = cols.some((c) => c.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

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
      message TEXT,
      creator_id TEXT,
      target_id TEXT,
      fire_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      follow_up_at TEXT,
      snooze_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      fired_at TEXT,
      completed_at TEXT,

      -- Legacy columns kept for compatibility/migration
      content TEXT,
      target_person_id TEXT,
      requested_by TEXT,
      follow_up_count INTEGER DEFAULT 0
    )
  `);
  ensureColumn(db, 'reminders', 'message', 'TEXT');
  ensureColumn(db, 'reminders', 'creator_id', 'TEXT');
  ensureColumn(db, 'reminders', 'target_id', 'TEXT');
  ensureColumn(db, 'reminders', 'follow_up_at', 'TEXT');
  ensureColumn(db, 'reminders', 'snooze_count', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'reminders', 'completed_at', 'TEXT');
  ensureColumn(db, 'reminders', 'follow_up_count', 'INTEGER DEFAULT 0');

  db.exec(`UPDATE reminders SET message = content WHERE message IS NULL AND content IS NOT NULL`);
  db.exec(`UPDATE reminders SET creator_id = requested_by WHERE creator_id IS NULL AND requested_by IS NOT NULL`);
  db.exec(`UPDATE reminders SET target_id = target_person_id WHERE target_id IS NULL AND target_person_id IS NOT NULL`);
  db.exec(`UPDATE reminders SET snooze_count = 0 WHERE snooze_count IS NULL`);
  db.exec(`UPDATE reminders SET follow_up_count = 0 WHERE follow_up_count IS NULL`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_status_fire ON reminders(status, fire_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_status_followup ON reminders(status, follow_up_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_evals (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_response TEXT NOT NULL,
      tools_called TEXT,
      capabilities_loaded TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_cost_usd REAL,
      response_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      quality_score INTEGER,
      quality_notes TEXT,
      failure_category TEXT,
      eval_source TEXT
    )
  `);

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
