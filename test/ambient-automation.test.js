import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { definition, execute, _resetState } from '../src/tools/ambient-automation.js';

const ENVELOPE = { person: 'lee', permissions: ['ha_all'] };

const SAMPLE_ACTIONS = [
  { entity_id: 'light.living_room', service: 'turn_on', service_data: { brightness_pct: 20, color_temp: 400 } },
  { entity_id: 'light.living_room_lamp', service: 'turn_on', service_data: { brightness_pct: 15 } },
];

const originalFetch = global.fetch;
const originalHaToken = process.env.HA_TOKEN;
const originalHaUrl = process.env.HA_URL;

beforeEach(() => {
  _resetState();
  process.env.HA_TOKEN = 'test-token';
  process.env.HA_URL = 'http://homeassistant.local:8123';
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalHaToken === undefined) {
    delete process.env.HA_TOKEN;
  } else {
    process.env.HA_TOKEN = originalHaToken;
  }
  if (originalHaUrl === undefined) {
    delete process.env.HA_URL;
  } else {
    process.env.HA_URL = originalHaUrl;
  }
  vi.restoreAllMocks();
});

// --- definition ---

describe('ambient_automation tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('ambient_automation');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires action param', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has expected values', () => {
    const actionProp = definition.input_schema.properties.action;
    expect(actionProp.enum).toContain('suggest_automation');
    expect(actionProp.enum).toContain('apply_automation');
    expect(actionProp.enum).toContain('list_automations');
  });
});

// --- missing HA_TOKEN ---

describe('missing HA_TOKEN', () => {
  it('returns error when HA_TOKEN is not set', async () => {
    delete process.env.HA_TOKEN;
    const result = await execute({ action: 'suggest_automation', actions: SAMPLE_ACTIONS }, ENVELOPE);
    expect(result.error).toMatch(/HA_TOKEN/);
  });
});

// --- suggest_automation ---

describe('suggest_automation', () => {
  it('returns suggestion_id and proposed_actions', async () => {
    const result = await execute(
      { action: 'suggest_automation', context: 'movie night', actions: SAMPLE_ACTIONS },
      ENVELOPE,
    );
    expect(result.suggestion_id).toMatch(/^sug_/);
    expect(result.proposed_actions).toEqual(SAMPLE_ACTIONS);
    expect(typeof result.message).toBe('string');
  });

  it('returns error when actions array is empty', async () => {
    const result = await execute({ action: 'suggest_automation', actions: [] }, ENVELOPE);
    expect(result.error).toMatch(/actions/);
  });

  it('returns error when actions is missing', async () => {
    const result = await execute({ action: 'suggest_automation' }, ENVELOPE);
    expect(result.error).toMatch(/actions/);
  });

  it('each call returns a unique suggestion_id', async () => {
    const r1 = await execute({ action: 'suggest_automation', actions: SAMPLE_ACTIONS }, ENVELOPE);
    const r2 = await execute({ action: 'suggest_automation', actions: SAMPLE_ACTIONS }, ENVELOPE);
    expect(r1.suggestion_id).not.toBe(r2.suggestion_id);
  });
});

// --- apply_automation ---

describe('apply_automation', () => {
  it('executes approved suggestion and returns applied count', async () => {
    const suggest = await execute(
      { action: 'suggest_automation', context: 'movie night', actions: SAMPLE_ACTIONS },
      ENVELOPE,
    );
    const result = await execute(
      { action: 'apply_automation', suggestion_id: suggest.suggestion_id },
      ENVELOPE,
    );
    expect(result.applied).toBe(2);
    expect(result.suppressed).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.success)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('calls HA API with correct service path', async () => {
    const suggest = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: suggest.suggestion_id }, ENVELOPE);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/services/light/turn_on');
  });

  it('includes service_data in HA request body', async () => {
    const suggest = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: suggest.suggestion_id }, ENVELOPE);
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.brightness_pct).toBe(20);
    expect(body.color_temp).toBe(400);
    expect(body.entity_id).toBe('light.living_room');
  });

  it('returns error when suggestion_id is missing', async () => {
    const result = await execute({ action: 'apply_automation' }, ENVELOPE);
    expect(result.error).toMatch(/suggestion_id/);
  });

  it('returns error when suggestion_id is unknown', async () => {
    const result = await execute({ action: 'apply_automation', suggestion_id: 'sug_bogus' }, ENVELOPE);
    expect(result.error).toMatch(/not found or expired/);
  });

  it('handles HA API failure gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });
    const suggest = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    const result = await execute(
      { action: 'apply_automation', suggestion_id: suggest.suggestion_id },
      ENVELOPE,
    );
    expect(result.applied).toBe(0);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toMatch(/503/);
  });
});

// --- oscillation prevention ---

describe('oscillation prevention', () => {
  it('suppresses duplicate action on same entity within 10 minutes', async () => {
    // First apply
    const s1 = await execute(
      { action: 'suggest_automation', context: 'first', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: s1.suggestion_id }, ENVELOPE);

    // Second apply immediately
    const s2 = await execute(
      { action: 'suggest_automation', context: 'second', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    const result = await execute(
      { action: 'apply_automation', suggestion_id: s2.suggestion_id },
      ENVELOPE,
    );

    expect(result.suppressed).toBe(1);
    expect(result.applied).toBe(0);
    expect(result.suppressed_details[0].entity_id).toBe('light.living_room');
    expect(result.suppressed_details[0].reason).toMatch(/already changed/);
  });

  it('allows action on different entity even after suppression', async () => {
    // Apply first entity
    const s1 = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: s1.suggestion_id }, ENVELOPE);

    // Apply second entity (different entity_id)
    const s2 = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[1]] },
      ENVELOPE,
    );
    const result = await execute(
      { action: 'apply_automation', suggestion_id: s2.suggestion_id },
      ENVELOPE,
    );

    expect(result.applied).toBe(1);
    expect(result.suppressed).toBe(0);
  });
});

// --- cost ceiling ---

describe('cost ceiling', () => {
  it('blocks apply_automation when cost ceiling is reached', async () => {
    // Exhaust the ceiling
    for (let i = 0; i < 20; i++) {
      const s = await execute(
        { action: 'suggest_automation', actions: [{ entity_id: `light.room_${i}`, service: 'turn_on' }] },
        ENVELOPE,
      );
      await execute({ action: 'apply_automation', suggestion_id: s.suggestion_id }, ENVELOPE);
    }

    // 21st apply should be blocked
    const s = await execute(
      { action: 'suggest_automation', actions: [{ entity_id: 'light.room_99', service: 'turn_on' }] },
      ENVELOPE,
    );
    const result = await execute(
      { action: 'apply_automation', suggestion_id: s.suggestion_id },
      ENVELOPE,
    );

    expect(result.error).toMatch(/Cost ceiling reached/);
  });
});

// --- list_automations ---

describe('list_automations', () => {
  it('returns empty log when no automations have run', async () => {
    const result = await execute({ action: 'list_automations' }, ENVELOPE);
    expect(result.count).toBe(0);
    expect(result.automations).toEqual([]);
    expect(result.cost_ceiling).toBe(20);
  });

  it('returns automations after apply', async () => {
    const s = await execute(
      { action: 'suggest_automation', context: 'movie night', actions: SAMPLE_ACTIONS },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: s.suggestion_id }, ENVELOPE);

    const result = await execute({ action: 'list_automations' }, ENVELOPE);
    expect(result.count).toBe(2);
    expect(result.automations[0].entity_id).toBe('light.living_room');
    expect(result.automations[0].context).toBe('movie night');
    expect(result.automations[0].person).toBe('lee');
  });

  it('includes cost_this_hour after applies', async () => {
    const s = await execute(
      { action: 'suggest_automation', actions: [SAMPLE_ACTIONS[0]] },
      ENVELOPE,
    );
    await execute({ action: 'apply_automation', suggestion_id: s.suggestion_id }, ENVELOPE);

    const result = await execute({ action: 'list_automations' }, ENVELOPE);
    expect(result.cost_this_hour).toBe(1);
  });
});

// --- unknown action ---

describe('unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'explode_everything' }, ENVELOPE);
    expect(result.error).toMatch(/Unknown action/);
  });
});
