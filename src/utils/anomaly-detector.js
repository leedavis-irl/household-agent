import { getHousehold } from './config.js';
import { sendMessage } from '../broker/signal.js';
import log from './logger.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const ANOMALY_ENABLED = process.env.ANOMALY_DETECTION_ENABLED !== 'false';

// Thresholds
const DOOR_OPEN_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const TEMP_MIN_F = 60; // below this is anomalous
const TEMP_MAX_F = 85; // above this is anomalous
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours between repeat alerts

// In-memory state
const alertedAnomalies = new Map(); // key -> { timestamp, message }
const recentAnomalies = []; // ring buffer of detected anomalies for query tool
const MAX_RECENT = 20;

// Exported for testing only
export function _resetState() {
  alertedAnomalies.clear();
  recentAnomalies.length = 0;
}

export function getRecentAnomalies() {
  return [...recentAnomalies];
}

async function haFetch(path) {
  const HA_TOKEN = process.env.HA_TOKEN;
  const HA_URL = process.env.HA_URL;
  const res = await fetch(`${HA_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error (${res.status}): ${text}`);
  }
  return res.json();
}

function isDoorEntity(entity) {
  const id = entity.entity_id.toLowerCase();
  return (
    entity.entity_id.startsWith('binary_sensor.') &&
    (id.includes('door') ||
      entity.attributes?.device_class === 'door' ||
      entity.attributes?.device_class === 'garage_door')
  );
}

function isWaterLeakEntity(entity) {
  const id = entity.entity_id.toLowerCase();
  return (
    entity.entity_id.startsWith('binary_sensor.') &&
    (id.includes('water') ||
      id.includes('moisture') ||
      id.includes('leak') ||
      entity.attributes?.device_class === 'moisture')
  );
}

function isTemperatureEntity(entity) {
  const id = entity.entity_id.toLowerCase();
  return (
    entity.entity_id.startsWith('sensor.') &&
    (id.includes('temperature') ||
      entity.attributes?.device_class === 'temperature' ||
      entity.attributes?.unit_of_measurement === '°F' ||
      entity.attributes?.unit_of_measurement === '°C')
  );
}

function shouldAlert(key) {
  const last = alertedAnomalies.get(key);
  if (!last) return true;
  return Date.now() - last.timestamp > DEDUP_WINDOW_MS;
}

function recordAnomaly(key, message) {
  alertedAnomalies.set(key, { timestamp: Date.now(), message });
  recentAnomalies.unshift({ timestamp: new Date().toISOString(), key, message });
  if (recentAnomalies.length > MAX_RECENT) {
    recentAnomalies.splice(MAX_RECENT);
  }
}

function getLeeSignal() {
  try {
    const household = getHousehold();
    return household.members?.lee?.identifiers?.signal || null;
  } catch {
    return null;
  }
}

export async function runAnomalyCheck() {
  if (!process.env.HA_TOKEN) {
    log.debug('Anomaly detector skipped: HA_TOKEN not set');
    return { skipped: true, reason: 'HA_TOKEN not configured' };
  }

  let states;
  try {
    states = await haFetch('/api/states');
  } catch (err) {
    log.error('Anomaly detector: failed to fetch HA states', { error: err.message });
    return { error: err.message };
  }

  const now = Date.now();
  const anomalies = [];

  for (const entity of states) {
    const name = entity.attributes?.friendly_name || entity.entity_id;

    // Door open > 30 minutes
    if (isDoorEntity(entity) && entity.state === 'on') {
      const openSince = new Date(entity.last_changed).getTime();
      const openMs = now - openSince;
      if (openMs > DOOR_OPEN_THRESHOLD_MS) {
        const openMins = Math.round(openMs / 60000);
        const key = `door_open:${entity.entity_id}`;
        const message = `Door open for ${openMins} min: ${name}`;
        if (shouldAlert(key)) {
          anomalies.push({ key, message, entity_id: entity.entity_id });
          recordAnomaly(key, message);
        }
      }
    }

    // Water leak detected
    if (isWaterLeakEntity(entity) && entity.state === 'on') {
      const key = `water_leak:${entity.entity_id}`;
      const message = `Water leak detected: ${name}`;
      if (shouldAlert(key)) {
        anomalies.push({ key, message, entity_id: entity.entity_id });
        recordAnomaly(key, message);
      }
    }

    // Temperature out of normal range
    if (isTemperatureEntity(entity)) {
      const rawValue = parseFloat(entity.state);
      if (!isNaN(rawValue)) {
        const unit = entity.attributes?.unit_of_measurement;
        const tempF = unit === '°C' ? rawValue * 9 / 5 + 32 : rawValue;
        if (tempF < TEMP_MIN_F || tempF > TEMP_MAX_F) {
          const direction = tempF < TEMP_MIN_F ? 'too cold' : 'too hot';
          const key = `temp_${direction.replace(' ', '_')}:${entity.entity_id}`;
          const message = `Temperature ${direction}: ${name} is ${rawValue}${unit || '°F'}`;
          if (shouldAlert(key)) {
            anomalies.push({ key, message, entity_id: entity.entity_id });
            recordAnomaly(key, message);
          }
        }
      }
    }
  }

  if (anomalies.length > 0) {
    const leeSignal = getLeeSignal();
    if (leeSignal) {
      const alertLines = anomalies.map((a) => `• ${a.message}`).join('\n');
      const msg = `🚨 Home alert:\n${alertLines}`;
      const delivered = sendMessage(leeSignal, msg);
      if (!delivered) {
        log.error('Anomaly alert: Signal send failed', { count: anomalies.length });
      } else {
        log.info('Anomaly alert sent', { count: anomalies.length });
      }
    } else {
      log.warn('Anomaly alert: no Signal number for Lee — alert suppressed', {
        count: anomalies.length,
      });
    }
  }

  log.debug('Anomaly check complete', { checked: states.length, anomalies: anomalies.length });
  return { checked: states.length, anomalies: anomalies.map((a) => a.message) };
}

export function startAnomalyDetector() {
  if (!ANOMALY_ENABLED) {
    log.info('Anomaly detector disabled (ANOMALY_DETECTION_ENABLED=false)');
    return;
  }
  runAnomalyCheck();
  setInterval(runAnomalyCheck, CHECK_INTERVAL_MS);
}
