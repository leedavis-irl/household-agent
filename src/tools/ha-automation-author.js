import log from '../utils/logger.js';

// In-memory draft storage (process lifetime, TTL 30 min)
const pendingDrafts = new Map();
const DRAFT_TTL_MS = 30 * 60 * 1000;

function generateDraftId() {
  return `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateAutomationId(description) {
  return (
    description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) +
    '_' +
    Date.now().toString(36)
  );
}

function expireDrafts() {
  const cutoff = Date.now() - DRAFT_TTL_MS;
  for (const [id, draft] of pendingDrafts.entries()) {
    if (draft.created_at < cutoff) pendingDrafts.delete(id);
  }
}

// Exported for testing only
export function _resetState() {
  pendingDrafts.clear();
}

export const definition = {
  name: 'ha_automation_author',
  description:
    'Draft and deploy Home Assistant automations from natural language. Use draft to generate an automation config and present it for user review, then deploy to push the approved automation to HA. NEVER call deploy without explicit user confirmation — always show the draft and wait for approval first.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['draft', 'deploy'],
        description:
          'draft: generate and store an automation config for user review; deploy: send an approved draft to HA',
      },
      description: {
        type: 'string',
        description:
          'For draft: natural language description of the automation (e.g., "turn on porch lights at sunset")',
      },
      config: {
        type: 'object',
        description:
          'For draft: the HA automation config as a JSON object. Must be a valid HA automation with alias, trigger, condition, and action fields. You generate this from the description.',
      },
      draft_id: {
        type: 'string',
        description: 'For deploy: the draft_id returned by the draft action',
      },
    },
    required: ['action'],
  },
};

export async function execute(input, envelope) {
  const HA_TOKEN = process.env.HA_TOKEN;
  const HA_URL = process.env.HA_URL;

  if (!HA_TOKEN) {
    return { error: 'Home Assistant not configured — set HA_TOKEN in .env' };
  }

  const { action } = input;

  if (action === 'draft') {
    const { description, config } = input;
    if (!description) {
      return { error: 'draft requires a description' };
    }
    if (!config || typeof config !== 'object') {
      return { error: 'draft requires a config object — generate the HA automation config from the description' };
    }

    expireDrafts();

    const draftId = generateDraftId();
    const automationId = generateAutomationId(description);
    const fullConfig = { id: automationId, ...config };

    pendingDrafts.set(draftId, {
      description,
      config: fullConfig,
      automation_id: automationId,
      created_at: Date.now(),
      person: envelope?.person,
    });

    log.info('HA automation draft created', {
      draft_id: draftId,
      automation_id: automationId,
      person: envelope?.person,
    });

    return {
      draft_id: draftId,
      automation_id: automationId,
      config: fullConfig,
      message: `Draft ready (ID: ${draftId}). Show the config to the user and ask for explicit approval before deploying. Do not call deploy until the user confirms.`,
    };
  }

  if (action === 'deploy') {
    const { draft_id } = input;
    if (!draft_id) {
      return { error: 'deploy requires a draft_id' };
    }

    const draft = pendingDrafts.get(draft_id);
    if (!draft) {
      return { error: `Draft ${draft_id} not found or expired. Run draft action again.` };
    }

    try {
      const res = await fetch(`${HA_URL}/api/config/automation/config/${draft.automation_id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft.config),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HA automation config API failed (${res.status}): ${text}`);
      }

      pendingDrafts.delete(draft_id);

      log.info('HA automation deployed', {
        draft_id,
        automation_id: draft.automation_id,
        description: draft.description,
        person: envelope?.person,
      });

      return {
        success: true,
        automation_id: draft.automation_id,
        message: `Automation "${draft.description}" deployed to Home Assistant (ID: ${draft.automation_id}).`,
      };
    } catch (err) {
      log.error('HA automation deploy failed', { draft_id, error: err.message });
      return { error: `Failed to deploy automation: ${err.message}` };
    }
  }

  return { error: `Unknown action: ${action}. Use draft or deploy.` };
}
