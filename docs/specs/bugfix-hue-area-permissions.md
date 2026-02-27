# Spec: HA Area-Based Discovery and Permissions

**ID:** BUGFIX-hue-area-perms
**Author:** Claude (Engineer)
**Status:** Draft

---

## Context

Iji controls Home Assistant devices via `ha_query` (read state) and `ha_control` (call services). The house has ~170 light entities across 37 HA areas, served by multiple Hue bridges, WiZ bulbs, and other integrations. Two problems exist:

1. **Discovery:** `ha_query` returns a flat list of entities (capped at 50) with no area grouping. Claude can't reliably map "turn on the workshop lights" to the correct entity ID because entity names are often opaque (`light.3rd_tier`, `light.east_spotlight`, `light.tulip_bulb_2`).

2. **Permissions:** `ha_control` uses inline substring matching on entity IDs to determine area permissions. The keyword map has 10 entries; the house has 37 areas. Most entities don't match any keyword and fall through to "require `ha_all`" — blocking all non-admin users from controlling most lights.

HA's area registry is well-populated and entities are properly assigned to areas. We should use it.

Read ARCHITECTURE.md for the four-flow design and tool patterns.

## Goal

Replace substring-based area matching with HA area registry lookups so that (a) Claude can discover what devices exist in each room, and (b) permission checks use actual HA area assignments mapped to a configurable area classification in `household.json`.

## What to Build

### 1. HA Area Resolver Utility

**File:** `src/utils/ha-areas.js` (Create)

A shared utility that fetches and caches the HA area→entity mapping. Used by both `ha_query` and `ha_control`.

**Interface:**

```js
// Returns Map<area_id, entity_id[]> — all entities grouped by area
await getAreaEntityMap()

// Returns the area_id for a given entity_id, or null if unassigned
await getEntityArea(entityId)

// Returns all area IDs
await getAreas()

// Force refresh (e.g., after config changes)
invalidateCache()
```

**Implementation notes:**
- Uses HA's `/api/template` endpoint with Jinja to query the area registry (the REST area registry endpoint is not exposed; template API is confirmed working).
- Caches result in memory with a 10-minute TTL. The area registry changes rarely (only when Lee reorganizes devices in HA).
- On cache miss or startup, makes two template calls: one for the area list, one for area→entity mapping.
- Reuses the `HA_URL` and `HA_TOKEN` env vars already used by `ha-query.js` and `ha-control.js`.

### 2. Area-Aware ha_query

**File:** `src/tools/ha-query.js` (Modify)

Add an `area` input parameter. When provided, query returns only entities in that area, grouped and labeled. Also add a `list_areas` boolean — when true, returns the list of all HA areas (so Claude can discover what rooms exist before querying a specific one).

**Updated input_schema additions:**

```json
{
  "area": {
    "type": "string",
    "description": "HA area ID to filter by (e.g., 'workshop', 'living_room', 'steve_s_office'). Returns only entities in that area."
  },
  "list_areas": {
    "type": "boolean",
    "description": "If true, returns the list of all HA areas. Use this to discover what rooms/zones exist."
  }
}
```

**Behavior changes:**
- If `list_areas` is true: return `{ areas: string[] }` — the full area list.
- If `area` is provided: fetch all states, filter to entities assigned to that area (via `ha-areas.js`), return those. No 50-entity cap for area-scoped queries (areas are naturally bounded). If `domain` is also provided, filter by both area AND domain.
- If neither `area` nor `list_areas`: existing behavior unchanged (flat entity list, capped at 50).
- Area-scoped results should include the area name in the response for Claude's context.

**Update tool description** to mention area-based querying so Claude knows to use it:

```
"Query Home Assistant for device and entity states. You can:
- Query a specific entity by ID
- Filter by domain (e.g., all lights, all sensors)
- Filter by area/room (e.g., 'workshop', 'living_room') — use list_areas=true first to see available areas
- Combine domain + area for targeted queries (e.g., all lights in the workshop)"
```

### 3. Area-Based Permission Checking in ha_control

**File:** `src/tools/ha-control.js` (Modify)

Replace the inline `AREA_PERMISSIONS` map and `checkAreaPermission()` function with a lookup against the HA area registry + a configurable area classification in `household.json`.

**New permission logic:**

```
1. ha_all bypasses all checks (unchanged — early return)
2. Resolve entity's HA area via ha-areas.js getEntityArea()
3. Look up area classification in household.json ha_areas config:
   - If ha_areas.common is "all" → require ha_common (universal access)
   - If ha_areas.common is an array and area is in it → require ha_common
   - If ha_areas.personal exists and area is in it → require ha_office AND person's key is in that area's owner list
   - If area is null/unknown/unmapped → require ha_all (safe default, same as before)
```

With the current config (`common: "all"`), step 3 always resolves to "require `ha_common`" — which every household member has.

**Remove entirely:** the `AREA_PERMISSIONS` constant and `checkAreaPermission()` function.

**Make the permission check async** (since `getEntityArea()` may need to fetch from HA on cache miss). The `execute()` function is already async, so this just means awaiting the permission call.

**Improve the denial message** to include the area name:

```
"Permission denied: {person} cannot control devices in {area_friendly_name}. That's a personal space belonging to {owners}."
```

### 4. Area Configuration in household.json

**File:** `config/household.json` (Modify)

Add an `ha_areas` section that classifies HA areas as common or personal:

```json
{
  "ha_areas": {
    "common": "all"
  }
}
```

When `common` is the string `"all"`, every HA area is treated as common — anyone with `ha_common` can control any device in any area. This is the household's current policy: everyone can control everything.

**Design notes:**
- The `"all"` shorthand avoids maintaining a 37-item area list that would need updating whenever a new area is added in HA.
- If the household later wants to restrict personal spaces, change `"all"` to an explicit common list and add a `"personal"` map (area→owner list). No code change needed — the resolver checks for the `"all"` shorthand first, then falls back to list/map lookup.
- All adults AND children have `ha_common` in their permissions, so this grants universal access as intended.

### 5. System Prompt Hint

**File:** `config/system-prompt.md` (Modify)

Add a brief note so Claude knows to use area-based querying for HA devices:

```
When controlling lights or other HA devices, use area-based queries to discover what's available.
Call ha_query with list_areas=true to see all rooms, then query a specific area to find its devices.
Prefer controlling Hue group entities (e.g., light.workshop, light.living_room) over individual bulbs
unless the person asks for a specific fixture. You can combine domain + area filters (e.g., domain="light", area="workshop").
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/utils/ha-areas.js` | Create | HA area registry resolver with caching |
| `src/tools/ha-query.js` | Modify | Add `area` and `list_areas` parameters |
| `src/tools/ha-control.js` | Modify | Replace substring matching with area registry lookup |
| `config/household.json` | Modify | Add `ha_areas` classification (common vs personal + owners) |
| `config/system-prompt.md` | Modify | Add area-based querying guidance for Claude |

## Server Requirements

- [ ] Config change in `config/household.json` (deployed via git)
- No new env vars, no new secrets, no new dependencies.

## Dependencies

None. Uses only the existing HA REST API (template endpoint) which is already authenticated via `HA_TOKEN`.

## Do NOT Change

- `src/utils/permissions.js` — tool-level permission gating stays as-is. This spec only changes the area-level check inside `ha_control`.
- The `ha_query` existing behavior for `entity_id` and `domain` queries — only additive changes.
- Any other tools, broker, brain, or router files.
- Permission definitions or member permission lists in `household.json` — the existing `ha_office` / `ha_common` / `ha_all` scheme is preserved; we're just making the area-level enforcement actually work.

## Commit Message

`fix(ha): replace substring area matching with HA area registry lookups`
