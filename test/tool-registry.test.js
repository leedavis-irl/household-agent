import { describe, it, expect, beforeAll } from 'vitest';
import { getToolDefinitions } from '../src/tools/index.js';

describe('tool registry integrity', () => {
  let definitions;

  beforeAll(() => {
    definitions = getToolDefinitions();
  });

  it('returns a non-empty array of tool definitions', () => {
    expect(Array.isArray(definitions)).toBe(true);
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('every definition has a name string', () => {
    for (const def of definitions) {
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it('every definition has a description string', () => {
    for (const def of definitions) {
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('every definition has an input_schema with type "object"', () => {
    for (const def of definitions) {
      expect(def.input_schema).toBeDefined();
      expect(def.input_schema.type).toBe('object');
    }
  });

  it('no duplicate tool names', () => {
    const names = definitions.map((d) => d.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('tool names use snake_case', () => {
    for (const def of definitions) {
      expect(def.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('includes all expected tools', () => {
    const names = new Set(definitions.map((d) => d.name));
    const expected = [
      'knowledge_search', 'knowledge_store',
      'ha_query', 'ha_control',
      'calendar_query', 'calendar_create', 'calendar_modify', 'calendar_freebusy',
      'message_send',
      'weather_query',
      'finance_accounts', 'finance_budget_summary',
      'finance_transactions', 'finance_paybacks', 'cost_query',
      'email_search', 'email_read', 'email_send', 'email_draft',
      'sms_send',
      'reminder_set', 'reminder_list', 'reminder_update', 'reminder_cancel',
      'feature_request', 'feature_request_list', 'feature_request_triage',
      'task_create', 'task_query', 'task_update',
      'web_search',
      'education_profile', 'education_documents', 'education_goals', 'education_team', 'education_upload',
      'docs_search', 'docs_read',
      'slack_search',
      'generate_document',
      'ambient_automation',
      'anomaly_query',
      'feedback_log',
      'decision_log',
      'findmy_locate',
    ];
    for (const name of expected) {
      expect(names.has(name), `missing tool: ${name}`).toBe(true);
    }
  });
});

describe('tool modules have execute functions', () => {
  // Dynamically import each tool module and verify it exports execute
  const toolFiles = [
    'knowledge-search', 'knowledge-store',
    'ha-query', 'ha-control',
    'calendar', 'calendar-create', 'calendar-modify', 'calendar-freebusy',
    'message-send',
    'weather-query',
    'finance-accounts', 'finance-budget-summary',
    'finance-transactions', 'finance-paybacks', 'cost-query',
    'email-search', 'email-read', 'email-send', 'email-draft',
    'sms-send',
    'reminder-set', 'reminder-list', 'reminder-update', 'reminder-cancel',
    'feature-request', 'feature-request-list', 'feature-request-triage',
    'task-create', 'task-query', 'task-update',
    'web-search',
    'education-profile', 'education-documents', 'education-goals', 'education-team', 'education-upload',
    'docs-search', 'docs-read',
    'slack-search',
    'generate-document',
    'ambient-automation',
    'anomaly-query',
    'feedback-log',
    'decision-log',
    'findmy-locate',
  ];

  for (const file of toolFiles) {
    it(`${file}.js exports a definition object`, async () => {
      const mod = await import(`../src/tools/${file}.js`);
      expect(mod.definition).toBeDefined();
      expect(typeof mod.definition.name).toBe('string');
    });

    it(`${file}.js exports an execute function`, async () => {
      const mod = await import(`../src/tools/${file}.js`);
      expect(typeof mod.execute).toBe('function');
    });
  }
});
