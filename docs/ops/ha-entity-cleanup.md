# HA Entity Naming Cleanup — Operations Runbook

## Overview

Multiple entity_id / friendly_name mismatches exist in Home Assistant and Hue. These don't block Iji (area registry is the source of truth), but they confuse humans browsing the HA UI and can mislead Claude when friendly names contradict area assignments.

**This is a manual admin task — no Iji code changes required.**

---

## Entities to Rename

### Fix in Home Assistant (Settings → Devices & Services → Entities)

| entity_id | Current friendly_name | Correct friendly_name | Notes |
|-----------|----------------------|----------------------|-------|
| `light.logan_bedside_lamp` | Living Room Floor Lamp 1 | Logan's Bedside Lamp | entity_id reflects correct room/person, friendly_name does not |
| `light.avalon_master_bedroom_status_light` | Avalon Basement | Avalon Master Bedroom Status Light | Completely wrong room in friendly_name |
| `light.train_station_*` (all variants) | train station … | Basement TV Room … | Room was renamed from "train station"; update all entities in this group |
| `light.hallie_office` | (office label) | Hallie's Bedroom | entity_id says office but the space is a bedroom |

### Fix in Hue App (Hue → Room/Zone → Device names)

| Device | Current name | Correct name | Notes |
|--------|-------------|-------------|-------|
| 4× bulbs in Logan's closet | `hue_ambiance_downlight_1` … `hue_ambiance_downlight_4` (generic) | Logan's Closet Downlight 1–4 | Generic Hue default names; rename in Hue app so HA picks up friendly names automatically |
| 7× WiZ bulbs in foyer | (null / blank) | Foyer Bulb 1–7 | Null friendly_names; set names in Hue/WiZ app so HA displays them correctly |

---

## Which System to Fix In

| Issue type | Fix location | Why |
|-----------|-------------|-----|
| friendly_name wrong but entity_id is correct | HA UI (entity registry) | Name is stored in HA's entity registry |
| Device name wrong in Hue | Hue app | Hue pushes the device name to HA as the friendly_name; fix at source |
| WiZ bulb null names | WiZ app or HA entity registry | Either set name in WiZ app, or override directly in HA entity registry |
| entity_id wrong (rename) | HA UI (entity registry) — use caution | Changing entity_id breaks any automations or dashboards referencing the old ID; audit first |

---

## Step-by-Step: Fix in HA UI

1. Open HA → **Settings** → **Devices & Services** → **Entities**
2. Search for the entity by its current name or entity_id
3. Click the entity row → click the pencil icon to edit
4. Update the **Name** (friendly_name) field
5. Optionally update the **Entity ID** if it's also wrong (confirm no automations reference the old ID first)
6. Save

Repeat for each entity in the HA table above.

## Step-by-Step: Fix in Hue App

1. Open the Philips Hue app
2. Navigate to the room containing the device (Logan's Closet, Foyer)
3. Tap the device → tap **Settings** (gear icon) → rename
4. After renaming, HA should pick up the new name on next sync (or restart HA integration)

## Step-by-Step: Fix WiZ Bulbs

Option A — WiZ app:
1. Open WiZ app → tap the bulb → tap **Settings** → rename

Option B — HA entity registry (override):
1. HA → Settings → Entities → search for the WiZ bulb
2. Edit the Name field directly

---

## Verification

After completing all fixes:

1. **HA entity list check** — Settings → Entities → scan for any remaining `train station`, `generic`, or null-named entries
2. **Iji query test** — Ask Iji: "What lights are in the living room?" → response should not include `Living Room Floor Lamp 1` (that was Logan's bedside lamp)
3. **Closet lights** — Ask Iji: "What lights are in Logan's closet?" → should return named downlights, not generic `hue_ambiance_downlight_*` labels
4. **Foyer lights** — Ask Iji: "What lights are in the foyer?" → all 7 WiZ bulbs should have names
5. **HA UI scan** — Browse HA dashboard and Entities list; confirm no friendly_names contradict their area assignment

---

## Done When

- [ ] `light.logan_bedside_lamp` friendly_name → "Logan's Bedside Lamp"
- [ ] `light.avalon_master_bedroom_status_light` friendly_name corrected
- [ ] All `light.train_station_*` entities renamed to Basement TV Room variants
- [ ] `light.hallie_office` friendly_name → "Hallie's Bedroom" (or entity_id updated)
- [ ] 4× Logan's closet Hue downlights named in Hue app
- [ ] 7× foyer WiZ bulbs have non-null names
- [ ] HA UI shows no mismatched or generic friendly_names
