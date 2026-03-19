import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { definition, execute, _resetState } from '../src/tools/ha-automation-author.js';

const ENVELOPE = { person: 'lee', permissions: ['ha_all'] };

const SAMPLE_CONFIG = {
  alias: 'Turn on porch lights at sunset',
  description: '',
  trigger: [{ platform: 'sun', event: 'sunset' }],
  condition: [],
  action: [{ service: 'light.turn_on', target: { area_id: 'porch' } }],
  mode: 'single',
};

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

describe('ha_automation_author definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('ha_automation_author');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires action param', () => {
    expect(definition.input_schema.required).toContain('action');
  });

  it('action enum has draft and deploy', () => {
    const actionProp = definition.input_schema.properties.action;
    expect(actionProp.enum).toContain('draft');
    expect(actionProp.enum).toContain('deploy');
  });
});

// --- missing HA_TOKEN ---

describe('missing HA_TOKEN', () => {
  it('returns error when HA_TOKEN is not set', async () => {
    delete process.env.HA_TOKEN;
    const result = await execute({ action: 'draft', description: 'test', config: SAMPLE_CONFIG }, ENVELOPE);
    expect(result.error).toMatch(/HA_TOKEN/);
  });
});

// --- draft action ---

describe('draft action', () => {
  it('returns draft_id and config', async () => {
    const result = await execute(
      { action: 'draft', description: 'turn on porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(result.draft_id).toMatch(/^auto_/);
    expect(result.config).toBeDefined();
    expect(result.automation_id).toBeDefined();
    expect(typeof result.message).toBe('string');
  });

  it('merges automation id into config', async () => {
    const result = await execute(
      { action: 'draft', description: 'turn on porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(result.config.id).toBe(result.automation_id);
    expect(result.config.alias).toBe(SAMPLE_CONFIG.alias);
  });

  it('returns error when description is missing', async () => {
    const result = await execute({ action: 'draft', config: SAMPLE_CONFIG }, ENVELOPE);
    expect(result.error).toMatch(/description/);
  });

  it('returns error when config is missing', async () => {
    const result = await execute({ action: 'draft', description: 'turn on lights' }, ENVELOPE);
    expect(result.error).toMatch(/config/);
  });

  it('returns error when config is not an object', async () => {
    const result = await execute({ action: 'draft', description: 'turn on lights', config: 'alias: test' }, ENVELOPE);
    expect(result.error).toMatch(/config/);
  });

  it('each call returns a unique draft_id', async () => {
    const r1 = await execute(
      { action: 'draft', description: 'lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    const r2 = await execute(
      { action: 'draft', description: 'lights at sunrise', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(r1.draft_id).not.toBe(r2.draft_id);
  });

  it('message instructs not to deploy without confirmation', async () => {
    const result = await execute(
      { action: 'draft', description: 'lock doors at midnight', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(result.message).toMatch(/approval|confirm/i);
  });

  it('does not call HA API during draft', async () => {
    await execute(
      { action: 'draft', description: 'turn on lights', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// --- deploy action ---

describe('deploy action', () => {
  it('deploys approved draft and returns success', async () => {
    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    const result = await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    expect(result.success).toBe(true);
    expect(result.automation_id).toBe(draft.automation_id);
    expect(typeof result.message).toBe('string');
  });

  it('calls HA config API with correct path', async () => {
    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain(`/api/config/automation/config/${draft.automation_id}`);
  });

  it('sends config JSON in request body', async () => {
    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.alias).toBe(SAMPLE_CONFIG.alias);
    expect(body.id).toBe(draft.automation_id);
  });

  it('uses Bearer token in Authorization header', async () => {
    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });

  it('returns error when draft_id is missing', async () => {
    const result = await execute({ action: 'deploy' }, ENVELOPE);
    expect(result.error).toMatch(/draft_id/);
  });

  it('returns error when draft_id is unknown', async () => {
    const result = await execute({ action: 'deploy', draft_id: 'auto_bogus' }, ENVELOPE);
    expect(result.error).toMatch(/not found or expired/);
  });

  it('removes draft after successful deploy', async () => {
    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    // Second deploy with same draft_id should fail
    const result = await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);
    expect(result.error).toMatch(/not found or expired/);
  });

  it('handles HA API failure gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid automation config',
    });

    const draft = await execute(
      { action: 'draft', description: 'porch lights at sunset', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    const result = await execute({ action: 'deploy', draft_id: draft.draft_id }, ENVELOPE);

    expect(result.error).toMatch(/400/);
    expect(result.success).toBeUndefined();
  });
});

// --- approval workflow ---

describe('approval workflow — no auto-deploy', () => {
  it('draft never calls the HA API', async () => {
    await execute(
      { action: 'draft', description: 'lock all doors at midnight', config: SAMPLE_CONFIG },
      ENVELOPE,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deploy requires prior draft — cannot deploy without a draft_id', async () => {
    const result = await execute({ action: 'deploy' }, ENVELOPE);
    expect(result.error).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// --- unknown action ---

describe('unknown action', () => {
  it('returns error for unknown action', async () => {
    const result = await execute({ action: 'explode' }, ENVELOPE);
    expect(result.error).toMatch(/Unknown action/);
  });
});
