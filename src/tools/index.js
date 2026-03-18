import * as knowledgeSearch from './knowledge-search.js';
import * as knowledgeStore from './knowledge-store.js';
import * as haQuery from './ha-query.js';
import * as haControl from './ha-control.js';
import * as haHistory from './ha-history.js';
import * as haScene from './ha-scene.js';
import * as haNotify from './ha-notify.js';
import * as calendar from './calendar.js';
import * as calendarCreate from './calendar-create.js';
import * as calendarModify from './calendar-modify.js';
import * as calendarFreebusy from './calendar-freebusy.js';
import * as messageSend from './message-send.js';
import * as weatherQuery from './weather-query.js';
import * as financeTransactions from './finance-transactions.js';
import * as financePaybacks from './finance-paybacks.js';
import * as financeAccounts from './finance-accounts.js';
import * as financeBudgetSummary from './finance-budget-summary.js';
import * as costQuery from './cost-query.js';
import * as emailSearch from './email-search.js';
import * as emailRead from './email-read.js';
import * as emailSend from './email-send.js';
import * as emailDraft from './email-draft.js';
import * as smsSend from './sms-send.js';
import * as reminderSet from './reminder-set.js';
import * as reminderList from './reminder-list.js';
import * as reminderUpdate from './reminder-update.js';
import * as reminderCancel from './reminder-cancel.js';
import * as featureRequest from './feature-request.js';
import * as featureRequestList from './feature-request-list.js';
import * as featureRequestTriage from './feature-request-triage.js';
import * as taskCreate from './task-create.js';
import * as taskQuery from './task-query.js';
import * as taskUpdate from './task-update.js';
import * as briefingPreferences from './briefing-preferences.js';
import * as educationProfile from './education-profile.js';
import * as educationDocuments from './education-documents.js';
import * as educationGoals from './education-goals.js';
import * as educationTeam from './education-team.js';
import * as webSearch from './web-search.js';
import { checkPermission } from '../utils/permissions.js';
import log from '../utils/logger.js';

const tools = {
  knowledge_search: knowledgeSearch,
  knowledge_store: knowledgeStore,
  ha_query: haQuery,
  ha_control: haControl,
  ha_history: haHistory,
  ha_scene: haScene,
  ha_notify: haNotify,
  calendar_query: calendar,
  calendar_create: calendarCreate,
  calendar_modify: calendarModify,
  calendar_freebusy: calendarFreebusy,
  message_send: messageSend,
  weather_query: weatherQuery,
  finance_transactions: financeTransactions,
  finance_paybacks: financePaybacks,
  finance_accounts: financeAccounts,
  finance_budget_summary: financeBudgetSummary,
  cost_query: costQuery,
  email_search: emailSearch,
  email_read: emailRead,
  email_send: emailSend,
  email_draft: emailDraft,
  sms_send: smsSend,
  reminder_set: reminderSet,
  reminder_list: reminderList,
  reminder_update: reminderUpdate,
  reminder_cancel: reminderCancel,
  feature_request: featureRequest,
  feature_request_list: featureRequestList,
  feature_request_triage: featureRequestTriage,
  task_create: taskCreate,
  task_query: taskQuery,
  task_update: taskUpdate,
  briefing_preferences: briefingPreferences,
  education_profile: educationProfile,
  education_documents: educationDocuments,
  education_goals: educationGoals,
  education_team: educationTeam,
  web_search: webSearch,
};

export function getToolDefinitions() {
  return Object.values(tools).map((t) => t.definition);
}

export async function executeTool(name, input, envelope) {
  const tool = tools[name];
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }

  const permCheck = checkPermission(envelope.permissions, name);
  if (!permCheck.allowed) {
    log.warn('Permission denied for tool', { tool: name, person: envelope.person });
    return { error: permCheck.reason };
  }

  log.info('Executing tool', { tool: name, person: envelope.person });
  try {
    return await tool.execute(input, envelope);
  } catch (err) {
    log.error('Tool execution failed', { tool: name, error: err.message });
    return { error: `Tool ${name} failed: ${err.message}` };
  }
}
