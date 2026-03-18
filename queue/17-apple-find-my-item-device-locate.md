# Apple Find My item/device locate

**Sphere:** Procurement & Errands
**Backlog item:** Apple Find My item/device locate
**Depends on:** Home Assistant with FindMySync integration

## What to build

Let adults ask Iji where their Apple devices and AirTag-tracked items are. Uses the FindMySync Mac app which syncs Find My data to Home Assistant as device_tracker entities, then Iji queries HA for location.

## Context

FindMySync (https://github.com/MartinPham/FindMySync) runs on a household Mac and syncs Apple Find My data to HA as device_tracker.* entities. Iji already has ha_query for reading HA state. The main work is a thin tool that queries device_tracker entities and presents location in a human-friendly way.

## Implementation notes

Create `src/tools/findmy-locate.js` that queries HA for `device_tracker.*` entities, filters by name/keyword, and returns location (latitude/longitude + geocoded address if available, plus last_updated timestamp). Tool name: `findmy_locate`. Add to ha permissions group.

## Server requirements

- [ ] FindMySync must be running on a household Mac (Lee's fingers required)
- [ ] FindMySync must be configured with HA long-lived token
- [ ] No new Iji env vars needed

## Verification

- Ask Iji: "Where is my phone?" → Returns location of Lee's phone from HA
- Ask Iji: "Where are the AirTags?" → Lists all tracked items with locations
- Ask if FindMySync isn't set up → Returns helpful error about missing setup

## Done when

- [ ] `findmy_locate` tool queries HA device_tracker entities
- [ ] Returns human-friendly location with timestamps
- [ ] Permission-gated to adults
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Apple Find My item/device locate" "In Review"
```

## Commit message

`feat: add Find My device/item location via HA device_tracker`
