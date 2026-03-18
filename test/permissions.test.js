import { describe, it, expect } from 'vitest';
import { checkPermission } from '../src/utils/permissions.js';

describe('checkPermission', () => {
  it('allows tools with no permission requirements (default allow)', () => {
    const result = checkPermission([], 'weather_query');
    expect(result.allowed).toBe(true);
  });

  it('allows tools with no permission requirements even with empty permissions', () => {
    const result = checkPermission([], 'some_unknown_tool');
    expect(result.allowed).toBe(true);
  });

  it('denies when user has no matching permission', () => {
    const result = checkPermission(['ha_common'], 'finance_transactions');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Permission denied/);
    expect(result.reason).toMatch(/financial/);
  });

  it('allows when user has one of the required permissions', () => {
    const result = checkPermission(['ha_common', 'knowledge_read'], 'knowledge_search');
    expect(result.allowed).toBe(true);
  });

  it('allows admin with ha_all for ha_control', () => {
    const result = checkPermission(['ha_all'], 'ha_control');
    expect(result.allowed).toBe(true);
  });

  it('allows ha_office for ha_query', () => {
    const result = checkPermission(['ha_office'], 'ha_query');
    expect(result.allowed).toBe(true);
  });

  it('denies finance tools without financial permission', () => {
    const adultPerms = ['ha_office', 'ha_common', 'calendar_own', 'knowledge_all'];
    for (const tool of ['finance_transactions', 'finance_paybacks', 'cost_query']) {
      const result = checkPermission(adultPerms, tool);
      expect(result.allowed).toBe(false);
    }
  });

  it('denies email_send without email_send permission', () => {
    const result = checkPermission(['email_own', 'email_all'], 'email_send');
    expect(result.allowed).toBe(false);
  });

  it('allows email_draft with email_send permission', () => {
    const result = checkPermission(['email_send'], 'email_draft');
    expect(result.allowed).toBe(true);
  });

  it('denies email_draft without email_send permission', () => {
    const result = checkPermission(['email_own', 'email_all'], 'email_draft');
    expect(result.allowed).toBe(false);
  });

  it('allows email_search with email_own', () => {
    const result = checkPermission(['email_own'], 'email_search');
    expect(result.allowed).toBe(true);
  });

  it('allows reminder tools with reminders permission', () => {
    for (const tool of ['reminder_set', 'reminder_list', 'reminder_update', 'reminder_cancel']) {
      const result = checkPermission(['reminders'], tool);
      expect(result.allowed).toBe(true);
    }
  });

  it('allows task tools with tasks permission', () => {
    for (const tool of ['task_create', 'task_query', 'task_update']) {
      const result = checkPermission(['tasks'], tool);
      expect(result.allowed).toBe(true);
    }
  });

  it('denies task tools for a user with no task permissions', () => {
    const result = checkPermission(['ha_common', 'knowledge_read'], 'task_create');
    expect(result.allowed).toBe(false);
  });

  it('allows web_search with web_search permission', () => {
    const result = checkPermission(['web_search'], 'web_search');
    expect(result.allowed).toBe(true);
  });

  it('denies web_search without web_search permission', () => {
    const result = checkPermission(['ha_common', 'knowledge_read'], 'web_search');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/web_search/);
  });

  it('allows education tools with education permission', () => {
    for (const tool of ['education_profile', 'education_documents', 'education_goals', 'education_team']) {
      const result = checkPermission(['education'], tool);
      expect(result.allowed).toBe(true);
    }
  });

  it('denies education tools without education permission', () => {
    for (const tool of ['education_profile', 'education_documents', 'education_goals', 'education_team']) {
      const result = checkPermission(['ha_common', 'knowledge_read'], tool);
      expect(result.allowed).toBe(false);
    }
  });

  it('allows docs tools with docs_read permission', () => {
    expect(checkPermission(['docs_read'], 'docs_search').allowed).toBe(true);
    expect(checkPermission(['docs_read'], 'docs_read').allowed).toBe(true);
  });

  it('allows docs tools with docs_all permission', () => {
    expect(checkPermission(['docs_all'], 'docs_search').allowed).toBe(true);
    expect(checkPermission(['docs_all'], 'docs_read').allowed).toBe(true);
  });

  it('denies docs tools without docs permission', () => {
    const noDocsPerms = ['ha_common', 'knowledge_read', 'web_search', 'email_own'];
    expect(checkPermission(noDocsPerms, 'docs_search').allowed).toBe(false);
    expect(checkPermission(noDocsPerms, 'docs_read').allowed).toBe(false);
    expect(checkPermission(noDocsPerms, 'docs_search').reason).toMatch(/Permission denied/);
  });

  it('allows slack_search with slack_search permission', () => {
    expect(checkPermission(['slack_search'], 'slack_search').allowed).toBe(true);
  });

  it('denies slack_search without slack_search permission', () => {
    const result = checkPermission(['ha_common', 'knowledge_read', 'web_search'], 'slack_search');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Permission denied/);
  });

  it('child permissions grant limited access', () => {
    const childPerms = ['ha_common', 'knowledge_read', 'reminders', 'tasks'];

    // Child can do
    expect(checkPermission(childPerms, 'ha_query').allowed).toBe(true);
    expect(checkPermission(childPerms, 'knowledge_search').allowed).toBe(true);
    expect(checkPermission(childPerms, 'reminder_set').allowed).toBe(true);
    expect(checkPermission(childPerms, 'task_create').allowed).toBe(true);
    expect(checkPermission(childPerms, 'weather_query').allowed).toBe(true);

    // Child cannot do
    expect(checkPermission(childPerms, 'knowledge_store').allowed).toBe(false);
    expect(checkPermission(childPerms, 'message_send').allowed).toBe(false);
    expect(checkPermission(childPerms, 'email_search').allowed).toBe(false);
    expect(checkPermission(childPerms, 'finance_transactions').allowed).toBe(false);
    expect(checkPermission(childPerms, 'sms_send').allowed).toBe(false);
    expect(checkPermission(childPerms, 'web_search').allowed).toBe(false);
    expect(checkPermission(childPerms, 'education_profile').allowed).toBe(false);
    expect(checkPermission(childPerms, 'docs_search').allowed).toBe(false);
    expect(checkPermission(childPerms, 'docs_read').allowed).toBe(false);
    expect(checkPermission(childPerms, 'slack_search').allowed).toBe(false);
  });
});
