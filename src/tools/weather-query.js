import log from '../utils/logger.js';
import { getHousehold } from '../utils/config.js';

const DEFAULT_LAT = 37.8716;
const DEFAULT_LNG = -122.2727;
const DEFAULT_LOCATION = 'Berkeley, CA';

const NWS_USER_AGENT = 'Iji Household Agent, contact@email.com';

/** @type {Map<string, { forecast: string, forecastHourly: string, observationStations: string, stationId?: string }>} */
const pointsCache = new Map();

async function nwsFetch(url, retries = 1) {
  const opts = {
    headers: { 'User-Agent': NWS_USER_AGENT },
    redirect: 'follow',
  };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`NWS API error (${res.status}): ${text.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw lastErr;
      }
    }
  }
  throw lastErr;
}

function cacheKey(lat, lng) {
  return `${lat},${lng}`;
}

async function getPoints(lat, lng) {
  const key = cacheKey(lat, lng);
  let cached = pointsCache.get(key);
  if (cached) return cached;

  const url = `https://api.weather.gov/points/${lat},${lng}`;
  const data = await nwsFetch(url);
  const props = data?.properties;
  if (!props?.forecast || !props?.forecastHourly || !props?.observationStations) {
    throw new Error('Invalid NWS points response');
  }
  cached = {
    forecast: props.forecast,
    forecastHourly: props.forecastHourly,
    observationStations: props.observationStations,
  };
  pointsCache.set(key, cached);
  return cached;
}

async function getStationId(observationStationsUrl) {
  const data = await nwsFetch(observationStationsUrl);
  const features = data?.features;
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error('No observation stations found');
  }
  const stationId = features[0]?.properties?.stationIdentifier;
  if (!stationId) throw new Error('Could not get station ID');
  return stationId;
}

function c2f(celsius) {
  if (celsius == null || typeof celsius !== 'number') return null;
  return Math.round((celsius * 9) / 5 + 32);
}

const CARDINALS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
function degToCardinal(deg) {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return '';
  const i = Math.round(((deg % 360) / 45)) % 8;
  return CARDINALS[i];
}

function resolveLocation(locationStr, labelFallback) {
  let locations = {};
  try {
    const household = getHousehold();
    locations = household?.locations || {};
  } catch {
    // Config not loaded (e.g. tests) — use defaults only
  }
  const normalized = (locationStr || '').trim().toLowerCase();

  if (!normalized || normalized === 'berkeley' || normalized === 'berkeley, ca') {
    return { lat: DEFAULT_LAT, lng: DEFAULT_LNG, label: labelFallback || DEFAULT_LOCATION };
  }

  if (locations[normalized]) {
    const loc = locations[normalized];
    return { lat: loc.lat, lng: loc.lng, label: loc.label || normalized };
  }

  const latLng = /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(normalized.replace(/\s/g, ''));
  if (latLng) {
    const lat = parseFloat(latLng[1]);
    const lng = parseFloat(latLng[2]);
    return { lat, lng, label: labelFallback || `${lat},${lng}` };
  }

  return null;
}

async function geocode(query) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoder error (${res.status})`);
  const data = await res.json();
  const matches = data?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`No coordinates found for "${query}"`);
  }
  const m = matches[0].coordinates;
  return { lat: m.y, lng: m.x, label: query };
}

export const definition = {
  name: 'weather_query',
  description:
    "Get current weather conditions and forecast for the household location (Berkeley, CA) or a specified location. Can answer: current temperature, rain/snow forecast, hourly breakdown, and multi-day outlook.",
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description:
          "One of: 'current' (default), 'today', 'hourly', or 'week'. Use 'current' for right-now conditions, 'today' for today's high/low and conditions, 'hourly' for next 12 hours, 'week' for multi-day outlook.",
      },
      location: {
        type: 'string',
        description:
          "Optional. Default: Berkeley, CA. Use a config label (e.g. 'home', 'tahoe', 'sf'), 'City, State', or lat,lng.",
      },
    },
  },
};

export async function execute(input, _envelope) {
  const type = (input?.type || 'current').toLowerCase();
  const locationInput = input?.location?.trim() || '';

  let coords;
  try {
    coords = resolveLocation(locationInput || undefined, DEFAULT_LOCATION);
    if (!coords && locationInput) {
      coords = await geocode(locationInput);
    }
    if (!coords) coords = { lat: DEFAULT_LAT, lng: DEFAULT_LNG, label: DEFAULT_LOCATION };
  } catch (err) {
    log.warn('Weather location resolution failed', { error: err.message, location: locationInput });
    return { error: err.message };
  }

  const { lat, lng, label } = coords;

  try {
    const points = await getPoints(lat, lng);

    if (type === 'current') {
      let stationId = points.stationId;
      if (!stationId) {
        stationId = await getStationId(points.observationStations);
        points.stationId = stationId;
      }
      const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      const obsData = await nwsFetch(obsUrl);
      const props = obsData?.properties;
      const tempC = props?.temperature?.value;
      const tempF = tempC != null ? c2f(tempC) : null;
      const textDesc = props?.textDescription || 'conditions unknown';
      const wind = props?.windSpeed?.value != null ? `${Math.round(props.windSpeed.value)} mph` : null;
      const dirVal = props?.windDirection?.value;
      const windDir =
        dirVal != null
          ? `from the ${typeof dirVal === 'string' ? dirVal.toLowerCase() : degToCardinal(Number(dirVal))}`
          : '';
      const windStr = wind ? `Wind: ${wind} ${windDir}`.trim() : '';
      const humidity = props?.relativeHumidity?.value != null ? `${Math.round(props.relativeHumidity.value)}%` : null;
      const humidityStr = humidity ? `Humidity: ${humidity}` : '';
      const parts = [
        tempF != null ? `Currently ${tempF}°F` : 'Current conditions',
        textDesc.toLowerCase(),
        `in ${label}.`,
      ];
      if (windStr) parts.push(windStr + '.');
      if (humidityStr) parts.push(humidityStr + '.');
      const message = parts.join(' ');
      return { message };
    }

    if (type === 'today') {
      const data = await nwsFetch(points.forecast);
      const periods = data?.properties?.periods || [];
      const today = periods.find((p) => p.number === 1) || periods[0];
      if (!today) {
        return { error: 'Could not get today\'s forecast' };
      }
      const high = today.temperature;
      const low = today.temperatureTrend ? null : (periods.find((p) => p.number === 2)?.temperature ?? '—');
      const shortForecast = today.shortForecast || '—';
      const precip = today.probabilityOfPrecipitation?.value != null ? `${today.probabilityOfPrecipitation.value}%` : null;
      const wind = today.windSpeed ? today.windSpeed : '';
      const line = `Today in ${label}: High of ${high}°F${low != null ? `, low of ${low}°F` : ''}. ${shortForecast}.${precip ? ` ${precip} chance of rain.` : ''}${wind ? ` Wind: ${wind}.` : ''}`;
      return { message: line };
    }

    if (type === 'hourly') {
      const data = await nwsFetch(points.forecastHourly);
      const periods = (data?.properties?.periods || []).slice(0, 12);
      const lines = periods.map((p) => {
        const start = p.startTime ? new Date(p.startTime) : null;
        const timeStr = start ? start.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }) : '—';
        return `${timeStr}: ${p.temperature}°F, ${(p.shortForecast || '').toLowerCase()}`;
      });
      const message = `Next 12 hours in ${label}:\n${lines.join('\n')}`;
      return { message };
    }

    if (type === 'week') {
      const data = await nwsFetch(points.forecast);
      const periods = data?.properties?.periods || [];
      const dayNames = periods.map((p) => {
        const start = p.startTime ? new Date(p.startTime) : null;
        return start ? start.toLocaleDateString('en-US', { weekday: 'short' }) : '—';
      });
      const lines = periods.slice(0, 7).map((p, i) => {
        const day = dayNames[i] || '—';
        const precip = p.probabilityOfPrecipitation?.value != null ? ` (${p.probabilityOfPrecipitation.value}%)` : '';
        return `${day}: High ${p.temperature}°F — ${p.shortForecast || '—'}${precip}`;
      });
      const message = `This week in ${label}:\n${lines.join('\n')}`;
      return { message };
    }

    return { error: `Unknown type: ${type}. Use 'current', 'today', 'hourly', or 'week'.` };
  } catch (err) {
    log.error('Weather query failed', { error: err.message, type, label });
    return { error: `Weather lookup failed: ${err.message}` };
  }
}
