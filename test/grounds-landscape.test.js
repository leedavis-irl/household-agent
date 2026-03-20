import { describe, it, expect, beforeEach } from 'vitest';
import { definition as createDef, execute as createExecute } from '../src/tools/task-create.js';
import { definition as queryDef, execute as queryExecute } from '../src/tools/task-query.js';
import { getDb } from '../src/utils/db.js';

const ENVELOPE = {
  person_id: 'alice',
  person: 'alice',
  permissions: ['tasks', 'tasks_others'],
};

function clearTasks() {
  const db = getDb();
  db.prepare('DELETE FROM tasks').run();
}

beforeEach(() => {
  clearTasks();
});

// --- task_create with category ---

describe('task_create grounds category', () => {
  it('creates a grounds task with category=grounds', async () => {
    const result = await createExecute(
      { title: 'Mow the back lawn', category: 'grounds' },
      ENVELOPE
    );
    expect(result.task_id).toBeDefined();
    expect(result.title).toBe('Mow the back lawn');
    expect(result.category).toBe('grounds');
    expect(result.status).toBe('open');
  });

  it('stores category in DB correctly', async () => {
    const result = await createExecute(
      { title: 'Trim the oak tree', category: 'grounds', description: 'Annual pruning of the large oak in the backyard' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.task_id);
    expect(row.category).toBe('grounds');
    expect(row.title).toBe('Trim the oak tree');
  });

  it('normalizes category to lowercase', async () => {
    const result = await createExecute(
      { title: 'Check irrigation', category: 'Grounds' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.task_id);
    expect(row.category).toBe('grounds');
  });

  it('stores null category when not provided', async () => {
    const result = await createExecute(
      { title: 'General household task' },
      ENVELOPE
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.task_id);
    expect(row.category).toBeNull();
  });

  it('creates task with due_at and category', async () => {
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await createExecute(
      { title: 'Mow front lawn', category: 'grounds', due_at: dueDate },
      ENVELOPE
    );
    expect(result.category).toBe('grounds');
    expect(result.due_at_local).toBeTruthy();
  });
});

// --- task_query with category filter ---

describe('task_query grounds category filter', () => {
  beforeEach(async () => {
    await createExecute({ title: 'Mow the back lawn', category: 'grounds' }, ENVELOPE);
    await createExecute({ title: 'Schedule irrigation check', category: 'grounds' }, ENVELOPE);
    await createExecute({ title: 'Buy groceries' }, ENVELOPE);
    await createExecute({ title: 'Fix leaky faucet' }, ENVELOPE);
  });

  it('filters tasks by category=grounds', async () => {
    const result = await queryExecute({ category: 'grounds', assignee_id: 'alice' }, ENVELOPE);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.category === 'grounds')).toBe(true);
  });

  it('grounds tasks contain expected titles', async () => {
    const result = await queryExecute({ category: 'grounds', assignee_id: 'alice' }, ENVELOPE);
    const titles = result.tasks.map((t) => t.title);
    expect(titles).toContain('Mow the back lawn');
    expect(titles).toContain('Schedule irrigation check');
  });

  it('non-grounds tasks are excluded when filtering by grounds', async () => {
    const result = await queryExecute({ category: 'grounds', assignee_id: 'alice' }, ENVELOPE);
    const titles = result.tasks.map((t) => t.title);
    expect(titles).not.toContain('Buy groceries');
    expect(titles).not.toContain('Fix leaky faucet');
  });

  it('query without category returns all tasks', async () => {
    const result = await queryExecute({ assignee_id: 'alice' }, ENVELOPE);
    expect(result.tasks).toHaveLength(4);
  });

  it('category filter is case-insensitive', async () => {
    const result = await queryExecute({ category: 'GROUNDS', assignee_id: 'alice' }, ENVELOPE);
    expect(result.tasks).toHaveLength(2);
  });

  it('returns category field on each task', async () => {
    const result = await queryExecute({ category: 'grounds', assignee_id: 'alice' }, ENVELOPE);
    expect(result.tasks[0].category).toBe('grounds');
  });
});

// --- tool definitions ---

describe('task_create definition', () => {
  it('has category property in schema', () => {
    expect(createDef.input_schema.properties.category).toBeDefined();
    expect(typeof createDef.input_schema.properties.category.description).toBe('string');
  });
});

describe('task_query definition', () => {
  it('has category property in schema', () => {
    expect(queryDef.input_schema.properties.category).toBeDefined();
    expect(typeof queryDef.input_schema.properties.category.description).toBe('string');
  });
});

// --- grounds capability prompt ---

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, '../config/prompts/capabilities/grounds.md');

describe('grounds capability prompt', () => {
  it('exists', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('mentions grounds/landscaping tasks', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toMatch(/grounds/i);
    expect(content).toMatch(/landscap/i);
  });

  it('mentions task_create with category=grounds', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toMatch(/task_create/);
    expect(content).toMatch(/category.*grounds/);
  });

  it('mentions reminder_set for recurring tasks', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toMatch(/reminder_set/);
  });

  it('mentions knowledge_store for logging completed work', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toMatch(/knowledge_store/);
  });
});
