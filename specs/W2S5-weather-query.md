# Wave 2, Step 5: Weather — `weather_query`

## Context

Iji is a household AI agent based in Berkeley, CA. This is the simplest tool in Wave 2 — one API, no auth complexity, no per-user setup.

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## API Selection

**NWS API (api.weather.gov)** — Free, no API key required, no rate limit account needed. US-only, which is fine since the household is in Berkeley. Returns detailed forecasts in a structured format. The only downside: two-step lookup (coordinates → grid point → forecast).

No Growth Protocol evaluation needed — NWS is the obvious choice for a US household that wants free, keyless, privacy-respecting weather data. No data sent to third parties, no account required.

## What to Build

### 1. Weather Tool (`src/tools/weather-query.js`)

**Tool name:** `weather_query`

**Description for Claude:** "Get current weather conditions and forecast for the household location (Berkeley, CA) or a specified location. Can answer: current temperature, rain/snow forecast, hourly breakdown, and multi-day outlook."

**Parameters:**
```json
{
  "type": "string — 'current' (default), 'today', 'hourly', or 'week'",
  "location": "string — optional, default: Berkeley, CA. Format: 'City, State' or lat,lng"
}
```

**Implementation:**

NWS API requires a two-step process:

**Step 1: Resolve location to grid point (cacheable)**
```
GET https://api.weather.gov/points/{lat},{lng}
```
Returns the forecast grid office and coordinates. For Berkeley: `GET https://api.weather.gov/points/37.8716,-122.2727`

Cache this response — it never changes for a given location. Store in memory (Map) with the location string as key.

**Step 2: Get forecast data**

For current conditions:
```
GET https://api.weather.gov/stations/{stationId}/observations/latest
```
The station ID comes from the `/points` response (observationStations URL → pick the first one).

For daily/weekly forecast:
```
GET {forecast URL from /points response}
```

For hourly forecast:
```
GET {forecastHourly URL from /points response}
```

**Response format:**

For `type: 'current'`:
```
"Currently 62°F and partly cloudy in Berkeley. Wind: 8 mph from the west. Humidity: 72%."
```

For `type: 'today'`:
```
"Today in Berkeley: High of 68°F, low of 54°F. Mostly sunny this morning, clouds moving in this afternoon. 10% chance of rain. Wind: 5-12 mph."
```

For `type: 'hourly'`:
```
"Next 12 hours in Berkeley:
3pm: 65°F, partly cloudy
4pm: 63°F, partly cloudy
5pm: 61°F, mostly cloudy
..."
```

For `type: 'week'`:
```
"This week in Berkeley:
Mon: High 68°F / Low 54°F — Mostly sunny
Tue: High 64°F / Low 52°F — Chance of rain (40%)
..."
```

**Hardcoded defaults:**
```javascript
const DEFAULT_LAT = 37.8716;
const DEFAULT_LNG = -122.2727;
const DEFAULT_LOCATION = 'Berkeley, CA';
```

**Location resolution for non-default locations:**
- If the user specifies a location like "San Francisco" or "Lake Tahoe", we need to geocode it
- Use the free US Census Geocoder API: `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address={query}&benchmark=Public_AR_Current&format=json`
- Or: hardcode a small lookup table for locations the household mentions frequently (Tahoe, SF, the kids' school address, etc.) — this avoids an extra API call for common queries
- Add to config/household.json:
```json
"locations": {
  "home": { "lat": 37.8716, "lng": -122.2727, "label": "Berkeley, CA" },
  "tahoe": { "lat": 39.1968, "lng": -120.2354, "label": "Olympic Valley, CA" },
  "sf": { "lat": 37.7749, "lng": -122.4194, "label": "San Francisco, CA" }
}
```

**NWS API quirks to handle:**
- NWS requires a `User-Agent` header with contact info: `User-Agent: (Iji Household Agent, contact@email.com)`
- Responses are in GeoJSON format — the actual data is nested under `properties`
- Temperature is in Fahrenheit by default in the forecast endpoint (good)
- The observation stations endpoint returns Celsius — convert to Fahrenheit
- NWS occasionally returns 500 errors — retry once with a 2-second delay
- The `/points` endpoint sometimes returns a 301 redirect — follow redirects

**No permissions needed** — weather is not sensitive. Any household member can ask.

### 2. Register Tool

Update `src/tools/index.js` to import and register the tool.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/tools/weather-query.js` | **Create** — weather_query tool |
| `src/tools/index.js` | **Modify** — register new tool |
| `config/household.json` | **Modify** — add locations section |

## Dependencies

None — use Node's native `fetch`.

## Testing Plan

1. Start Iji: `npm start`
2. CLI: "What's the weather?" → current conditions in Berkeley
3. CLI: "Will it rain today?" → today's forecast
4. CLI: "What's the weather in Tahoe this weekend?" → should resolve location and return forecast
5. CLI: "Hourly forecast for this afternoon" → hourly breakdown
6. CLI: "Do I need a jacket?" → Claude should use current + today forecast to answer contextually
7. Test NWS API failure: disconnect network briefly → verify retry and graceful error message

## Lee's Fingers Required

None. Zero setup. This tool works immediately after Cursor implements it.
