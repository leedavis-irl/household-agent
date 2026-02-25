import log from './logger.js';

const HA_URL = process.env.HA_URL || 'http://100.127.233.50:8123';
const HA_TOKEN = process.env.HA_TOKEN;
const TTL_MS = 10 * 60 * 1000;

let cache = null;

function hasValidCache() {
  return cache && cache.expiresAt > Date.now();
}

async function callTemplate(template) {
  if (!HA_TOKEN) {
    throw new Error('Home Assistant not configured — set HA_TOKEN in .env');
  }

  const res = await fetch(`${HA_URL}/api/template`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant template API error (${res.status}): ${text}`);
  }

  return res.text();
}

async function refreshCache() {
  // Call 1: area list
  const areasRaw = await callTemplate(`{{ areas() | tojson }}`);
  let areas;
  try {
    areas = JSON.parse(areasRaw);
  } catch (err) {
    throw new Error(`Failed to parse HA areas response: ${err.message}`);
  }
  if (!Array.isArray(areas)) {
    throw new Error('HA areas response is not an array.');
  }

  // Call 2: area -> entity mapping
  const mappingRaw = await callTemplate(`
{% for a in areas() -%}
{{ a }}::{{ area_entities(a) | join(',') }}
{% if not loop.last %}\n{% endif -%}
{%- endfor %}
`);

  const areaEntityMap = new Map();
  const entityAreaMap = new Map();
  for (const line of mappingRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('::');
    if (idx === -1) continue;
    const areaId = trimmed.slice(0, idx).trim();
    const entityCsv = trimmed.slice(idx + 2).trim();
    const entities = entityCsv
      ? entityCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    areaEntityMap.set(areaId, entities);
    for (const entityId of entities) {
      entityAreaMap.set(entityId, areaId);
    }
  }

  for (const areaId of areas) {
    if (!areaEntityMap.has(areaId)) {
      areaEntityMap.set(areaId, []);
    }
  }

  cache = {
    areas,
    areaEntityMap,
    entityAreaMap,
    expiresAt: Date.now() + TTL_MS,
  };
}

async function ensureCache() {
  if (hasValidCache()) return;
  try {
    await refreshCache();
  } catch (err) {
    log.error('Failed to refresh HA area cache', { error: err.message });
    throw err;
  }
}

export async function getAreaEntityMap() {
  await ensureCache();
  return cache.areaEntityMap;
}

export async function getEntityArea(entityId) {
  await ensureCache();
  return cache.entityAreaMap.get(entityId) || null;
}

export async function getAreas() {
  await ensureCache();
  return cache.areas;
}

export function invalidateCache() {
  cache = null;
}
