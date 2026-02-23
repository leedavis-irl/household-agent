const TOOL_PERMISSIONS = {
  knowledge_search: ['knowledge_all', 'knowledge_read'],
  knowledge_store: ['knowledge_all'],
  ha_query: ['ha_all', 'ha_office', 'ha_common'],
  ha_control: ['ha_all', 'ha_office', 'ha_common'],
  calendar_query: ['calendar_all', 'calendar_own', 'calendar_household'],
  calendar_create: ['calendar_all', 'calendar_own'],
  calendar_modify: ['calendar_all', 'calendar_own'],
  calendar_freebusy: ['calendar_household', 'calendar_all'],
  message_send: ['message_send'],
  finance_transactions: ['financial'],
  finance_paybacks: ['financial'],
  cost_query: ['financial'],
  email_search: ['email_own', 'email_all'],
  email_read: ['email_own', 'email_all'],
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
