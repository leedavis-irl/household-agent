/**
 * Tool -> permission mapping.
 *
 * DESIGN NOTES:
 * - Tools NOT listed here are accessible to all users (default allow).
 *   This is intentional for: weather_query (everyone can ask about weather).
 * - ha_control uses area-based substring matching on entity IDs.
 *   If an entity ID doesn't contain an area token (office, kitchen, etc.),
 *   non-admin users will be denied. Workaround: use ha_all, or name entities
 *   with area prefixes. Future improvement: query HA area registry.
 */
const TOOL_PERMISSIONS = {
  knowledge_search: ['knowledge_all', 'knowledge_read'],
  knowledge_store: ['knowledge_all'],
  ha_query: ['ha_all', 'ha_office', 'ha_common'],
  ha_control: ['ha_all', 'ha_office', 'ha_common'],
  ha_history: ['ha_all', 'ha_office', 'ha_common'],
  ha_scene: ['ha_all', 'ha_common'],
  ha_notify: ['ha_all'],
  calendar_query: ['calendar_all', 'calendar_own', 'calendar_household'],
  calendar_create: ['calendar_all', 'calendar_own'],
  calendar_modify: ['calendar_all', 'calendar_own'],
  calendar_freebusy: ['calendar_household', 'calendar_all'],
  message_send: ['message_send'],
  finance_transactions: ['financial'],
  finance_paybacks: ['financial'],
  finance_accounts: ['financial'],
  finance_budget_summary: ['financial'],
  cost_query: ['financial'],
  email_search: ['email_own', 'email_all'],
  email_read: ['email_own', 'email_all'],
  email_send: ['email_send'],
  sms_send: ['sms_send'],
  reminder_set: ['reminders', 'reminders_others'],
  reminder_list: ['reminders', 'reminders_others'],
  reminder_update: ['reminders', 'reminders_others'],
  reminder_cancel: ['reminders', 'reminders_others'],
  task_create: ['tasks', 'tasks_others'],
  task_query: ['tasks', 'tasks_others'],
  task_update: ['tasks', 'tasks_others'],
};

export function checkPermission(personPermissions, toolName) {
  const required = TOOL_PERMISSIONS[toolName];
  if (!required) {
    // Tool has no permission requirements — allow by default
    return { allowed: true };
  }
  const hasPermission = required.some((perm) => personPermissions.includes(perm));
  if (hasPermission) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Permission denied: you do not have access to ${toolName}. Required: ${required.join(' or ')}`,
  };
}
