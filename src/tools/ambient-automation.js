import log from '../utils/logger.js';

// In-memory state (lives for the process lifetime)
const actionLog = [];
const pendingSuggestions = new Map();

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const COST_CEILING_PER_HOUR = 20;
const costTracker = { hour: null, count: 0 };

function currentHour() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
}

function checkCostCeiling() {
  const hour = currentHour();
  if (costTracker.hour !== hour) {
    costTracker.hour = hour;
    costTracker.count = 0;
  }
  if (costTracker.count >= COST_CEILING_PER_HOUR) {
    return {
      ok: false,
      reason: `Cost ceiling reached: ${COST_CEILING_PER_HOUR} automation actions per hour. Try again next hour.`,
    };
  }
  costTracker.count++;
  return { ok: true };
}

function checkOscillation(entityId) {
  const now = Date.now();
  const recent = actionLog.find(
    (e) => e.entity_id === entityId && now - e.timestamp < DEDUP_WINDOW_MS,
  );
  if (recent) {
    const minsAgo = Math.round((now - recent.timestamp) / 60000);
    return {
      blocked: true,
      reason: `${entityId} was already changed ${minsAgo} minute(s) ago. Suppressing to prevent oscillation.`,
    };
  }
  return { blocked: false };
}

function generateSuggestionId() {
  return `sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function callHaService(haUrl, haToken, entityId, service, serviceData = {}) {
  const body = { entity_id: entityId, ...serviceData };
  const res = await fetch(`${haUrl}/api/services/light/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${haToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA service call failed (${res.status}): ${text}`);
  }
}

// Exported for testing only
export function _resetState() {
  actionLog.length = 0;
  pendingSuggestions.clear();
  costTracker.hour = null;
  costTracker.count = 0;
}

export const definition = {
  name: 'ambient_automation',
  description:
    'Proactively suggest and execute ambient light automation. Use suggest_automation to propose light changes (returns a suggestion_id for user confirmation), apply_automation to execute an approved suggestion, or list_automations to show today\'s action log. Includes oscillation prevention (no repeated actions within 10 minutes) and a per-hour cost ceiling. V1 scope: lights only. Query ha_query first to find entity IDs.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['suggest_automation', 'apply_automation', 'list_automations'],
        description:
          'suggest_automation: propose light changes and return a suggestion_id; apply_automation: execute an approved suggestion; list_automations: show today\'s automation log',
      },
      context: {
        type: 'string',
        description:
          'For suggest_automation: human-readable description of the intent (e.g., "movie night in the living room")',
      },
      actions: {
        type: 'array',
        description:
          'For suggest_automation: the light actions to propose. Each action must include entity_id and service. Use ha_query to discover entity IDs first.',
        items: {
          type: 'object',
          properties: {
            entity_id: { type: 'string', description: 'HA light entity ID (e.g., "light.living_room")' },
            service: { type: 'string', description: 'HA light service: turn_on or turn_off' },
            service_data: {
              type: 'object',
              description: 'Optional service data (e.g., { brightness_pct: 20, color_temp: 400 })',
            },
          },
          required: ['entity_id', 'service'],
        },
      },
      suggestion_id: {
        type: 'string',
        description: 'For apply_automation: the suggestion_id returned by suggest_automation',
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

  if (action === 'suggest_automation') {
    const actions = input.actions || [];
    if (actions.length === 0) {
      return { error: 'suggest_automation requires at least one action in the actions array' };
    }

    const suggestionId = generateSuggestionId();
    pendingSuggestions.set(suggestionId, {
      actions,
      context: input.context || '',
      timestamp: Date.now(),
      person: envelope?.person,
    });

    // Expire suggestions older than 30 minutes
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, sug] of pendingSuggestions.entries()) {
      if (sug.timestamp < cutoff) pendingSuggestions.delete(id);
    }

    log.info('Ambient automation suggested', {
      suggestion_id: suggestionId,
      action_count: actions.length,
      person: envelope?.person,
    });

    return {
      suggestion_id: suggestionId,
      proposed_actions: actions,
      message: `Suggestion ready (${actions.length} action${actions.length === 1 ? '' : 's'}). Share the proposed_actions with the user for confirmation, then call apply_automation with this suggestion_id.`,
    };
  }

  if (action === 'apply_automation') {
    const { suggestion_id } = input;
    if (!suggestion_id) {
      return { error: 'apply_automation requires a suggestion_id' };
    }

    const suggestion = pendingSuggestions.get(suggestion_id);
    if (!suggestion) {
      return { error: `Suggestion ${suggestion_id} not found or expired. Run suggest_automation again.` };
    }

    const costCheck = checkCostCeiling();
    if (!costCheck.ok) {
      return { error: costCheck.reason };
    }

    const results = [];
    const suppressed = [];

    for (const act of suggestion.actions) {
      const oscCheck = checkOscillation(act.entity_id);
      if (oscCheck.blocked) {
        suppressed.push({ entity_id: act.entity_id, reason: oscCheck.reason });
        continue;
      }

      try {
        await callHaService(HA_URL, HA_TOKEN, act.entity_id, act.service, act.service_data || {});
        actionLog.push({
          timestamp: Date.now(),
          entity_id: act.entity_id,
          service: act.service,
          service_data: act.service_data,
          person: envelope?.person,
          suggestion_id,
          context: suggestion.context,
        });
        results.push({ entity_id: act.entity_id, service: act.service, success: true });
      } catch (err) {
        log.error('Ambient automation action failed', { entity_id: act.entity_id, error: err.message });
        results.push({ entity_id: act.entity_id, service: act.service, success: false, error: err.message });
      }
    }

    pendingSuggestions.delete(suggestion_id);

    log.info('Ambient automation applied', {
      suggestion_id,
      applied: results.filter((r) => r.success).length,
      suppressed: suppressed.length,
      person: envelope?.person,
    });

    return {
      applied: results.filter((r) => r.success).length,
      suppressed: suppressed.length,
      results,
      ...(suppressed.length > 0 ? { suppressed_details: suppressed } : {}),
    };
  }

  if (action === 'list_automations') {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayLog = actionLog.filter((e) => e.timestamp >= startOfDay);

    return {
      count: todayLog.length,
      automations: todayLog.map((e) => ({
        time: new Date(e.timestamp).toLocaleTimeString(),
        entity_id: e.entity_id,
        service: e.service,
        context: e.context,
        person: e.person,
      })),
      cost_this_hour: costTracker.hour === currentHour() ? costTracker.count : 0,
      cost_ceiling: COST_CEILING_PER_HOUR,
    };
  }

  return {
    error: `Unknown action: ${action}. Use suggest_automation, apply_automation, or list_automations.`,
  };
}
