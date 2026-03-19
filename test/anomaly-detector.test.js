import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runAnomalyCheck,
  getRecentAnomalies,
  _resetState,
} from '../src/utils/anomaly-detector.js';

// --- fixtures ---

function makeEntity(entity_id, state, last_changed, attributes = {}) {
  return { entity_id, state, last_changed, attributes };
}

// A door that has been open for 35 minutes
function openDoor(entity_id = 'binary_sensor.front_door') {
  const openSince = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  return makeEntity(entity_id, 'on', openSince, {
    friendly_name: 'Front Door',
    device_class: 'door',
  });
}

// A door that has only been open for 5 minutes (within threshold)
function recentlyOpenedDoor() {
  const openSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return makeEntity('binary_sensor.front_door', 'on', openSince, {
    friendly_name: 'Front Door',
    device_class: 'door',
  });
}

// A closed door
function closedDoor() {
  return makeEntity('binary_sensor.front_door', 'off', new Date().toISOString(), {
    friendly_name: 'Front Door',
    device_class: 'door',
  });
}

// A water leak sensor
function waterLeak(entity_id = 'binary_sensor.kitchen_water_sensor') {
  return makeEntity(entity_id, 'on', new Date().toISOString(), {
    friendly_name: 'Kitchen Water Sensor',
    device_class: 'moisture',
  });
}

// A temperature sensor with °F value
function tempSensorF(value, entity_id = 'sensor.living_room_temperature') {
  return makeEntity(entity_id, String(value), new Date().toISOString(), {
    friendly_name: 'Living Room Temperature',
    device_class: 'temperature',
    unit_of_measurement: '°F',
  });
}

// A temperature sensor with °C value
function tempSensorC(value, entity_id = 'sensor.bedroom_temperature') {
  return makeEntity(entity_id, String(value), new Date().toISOString(), {
    friendly_name: 'Bedroom Temperature',
    device_class: 'temperature',
    unit_of_measurement: '°C',
  });
}

// --- setup ---

const originalFetch = global.fetch;
const originalHaToken = process.env.HA_TOKEN;
const originalHaUrl = process.env.HA_URL;

function mockStates(states) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => states,
    text: async () => '',
  });
}

beforeEach(() => {
  _resetState();
  process.env.HA_TOKEN = 'test-token';
  process.env.HA_URL = 'http://homeassistant.local:8123';
  // Mock Signal sendMessage to avoid real network calls
  vi.mock('../src/broker/signal.js', () => ({ sendMessage: vi.fn().mockReturnValue(true) }));
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalHaToken === undefined) delete process.env.HA_TOKEN;
  else process.env.HA_TOKEN = originalHaToken;
  if (originalHaUrl === undefined) delete process.env.HA_URL;
  else process.env.HA_URL = originalHaUrl;
  vi.restoreAllMocks();
});

// --- missing HA_TOKEN ---

describe('missing HA_TOKEN', () => {
  it('skips check when HA_TOKEN is not set', async () => {
    delete process.env.HA_TOKEN;
    const result = await runAnomalyCheck();
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/HA_TOKEN/);
  });
});

// --- HA fetch error ---

describe('HA fetch error', () => {
  it('returns error when HA API call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });
    const result = await runAnomalyCheck();
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });
});

// --- door detection ---

describe('door anomaly detection', () => {
  it('flags a door that has been open > 30 minutes', async () => {
    mockStates([openDoor()]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/Door open/);
    expect(result.anomalies[0]).toMatch(/Front Door/);
  });

  it('does not flag a door open for < 30 minutes', async () => {
    mockStates([recentlyOpenedDoor()]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(0);
  });

  it('does not flag a closed door', async () => {
    mockStates([closedDoor()]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(0);
  });

  it('detects door by entity_id containing "door"', async () => {
    const door = makeEntity(
      'binary_sensor.back_door',
      'on',
      new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      { friendly_name: 'Back Door' }
    );
    mockStates([door]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/Door open/);
  });
});

// --- water leak detection ---

describe('water leak detection', () => {
  it('flags an active water leak sensor', async () => {
    mockStates([waterLeak()]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/Water leak/);
  });

  it('does not flag a water leak sensor in off state', async () => {
    const dry = makeEntity(
      'binary_sensor.kitchen_water_sensor',
      'off',
      new Date().toISOString(),
      { device_class: 'moisture' }
    );
    mockStates([dry]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(0);
  });

  it('detects leak sensor by entity_id containing "leak"', async () => {
    const leak = makeEntity(
      'binary_sensor.basement_leak_detector',
      'on',
      new Date().toISOString(),
      { friendly_name: 'Basement Leak' }
    );
    mockStates([leak]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
  });
});

// --- temperature detection ---

describe('temperature anomaly detection', () => {
  it('flags temperature below 60°F', async () => {
    mockStates([tempSensorF(55)]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/too cold/);
  });

  it('flags temperature above 85°F', async () => {
    mockStates([tempSensorF(92)]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/too hot/);
  });

  it('does not flag temperature within normal range', async () => {
    mockStates([tempSensorF(72)]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(0);
  });

  it('converts °C to °F for threshold comparison', async () => {
    // 10°C = 50°F → too cold
    mockStates([tempSensorC(10)]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatch(/too cold/);
  });

  it('does not flag non-numeric temperature state', async () => {
    const sensor = makeEntity('sensor.some_temp', 'unavailable', new Date().toISOString(), {
      device_class: 'temperature',
      unit_of_measurement: '°F',
    });
    mockStates([sensor]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(0);
  });
});

// --- deduplication ---

describe('deduplication', () => {
  it('does not send repeat alert for same anomaly within 2 hours', async () => {
    mockStates([openDoor()]);
    const r1 = await runAnomalyCheck();
    expect(r1.anomalies).toHaveLength(1);

    const r2 = await runAnomalyCheck();
    expect(r2.anomalies).toHaveLength(0); // deduped
  });

  it('tracks different entity anomalies independently', async () => {
    mockStates([openDoor('binary_sensor.front_door'), waterLeak()]);
    const r1 = await runAnomalyCheck();
    expect(r1.anomalies).toHaveLength(2);

    const r2 = await runAnomalyCheck();
    expect(r2.anomalies).toHaveLength(0); // both deduped
  });
});

// --- multiple anomalies ---

describe('multiple anomalies', () => {
  it('returns all anomalies in a single check', async () => {
    mockStates([openDoor(), waterLeak(), tempSensorF(50)]);
    const result = await runAnomalyCheck();
    expect(result.anomalies).toHaveLength(3);
  });
});

// --- getRecentAnomalies ---

describe('getRecentAnomalies', () => {
  it('returns empty array before any checks', () => {
    expect(getRecentAnomalies()).toEqual([]);
  });

  it('returns detected anomalies after a check', async () => {
    mockStates([waterLeak()]);
    await runAnomalyCheck();
    const recent = getRecentAnomalies();
    expect(recent).toHaveLength(1);
    expect(recent[0].message).toMatch(/Water leak/);
    expect(recent[0].timestamp).toBeDefined();
  });

  it('returns a copy (mutations do not affect internal state)', async () => {
    mockStates([waterLeak()]);
    await runAnomalyCheck();
    const recent = getRecentAnomalies();
    recent.push({ fake: true });
    expect(getRecentAnomalies()).toHaveLength(1);
  });
});

// --- checked count ---

describe('checked count', () => {
  it('reports how many entities were checked', async () => {
    mockStates([closedDoor(), tempSensorF(72)]);
    const result = await runAnomalyCheck();
    expect(result.checked).toBe(2);
  });
});
