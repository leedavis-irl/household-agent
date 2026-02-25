# Iji Hardware Reference

Reference material for physical infrastructure related to Iji and household automation.
This is intentionally not a task tracker; backlog priority/status lives in `BACKLOG.md`.

## Bill of Materials

| Item | Status | Purpose | Location/Notes |
|------|--------|---------|----------------|
| Shelly 1PM Mini Gen4 (10x) | ✅ Purchased | Keep smart bulbs powered; detached-switch mode for reliable HA control | For Buster + Punch toggle boxes. Example listing: `amazon.com/dp/B0FPMMC9XG` |
| Wago 221 lever connector kit (105pc) | ✅ Purchased | Safe line/neutral splicing for relay retrofits | Example listing: `amazon.com/dp/B0C6R2J52C` |
| 14 AWG solid THHN pigtail wire (black) | ❌ Need to buy | Hot/line pigtails from Wago to Shelly terminals | THE CIMPLE CO 10ft spool (black variant) |
| 14 AWG solid THHN pigtail wire (white) | ❌ Need to buy | Neutral pigtails from Wago to Shelly terminals | THE CIMPLE CO 10ft spool (white variant), example `amazon.com/dp/B07J9L6JD3` |
| Wire strippers + voltage tester | ✅ Have | Safe installation and verification | Existing house rewire tools |
| Room display prototype (e-ink) | ⚠️ One unit available | First wall-display proof of concept | Reserved for room-display prototype |
| Room display production hardware (tablet/e-ink mix) | ❌ Not selected | Per-room local dashboards (living room, kitchen, bedrooms, front door) | Final hardware choice pending dashboard iteration |
| Kids routine button hardware (Seeed XIAO ESP32-C6) | ❌ Not purchased | Physical completion buttons for AM/PM routines | For bathroom/laundry/kitchen/med station tasks |
| Kids command-center display (front door) | ❌ Not purchased | Visual routine completion board + parent visibility | E-ink or tablet; HA/ESPHome integration |

## Installation/Design Notes

- Shelly retrofit is the key reliability unlock for lighting control (`ha_control`) because bulbs no longer lose power when wall switches are toggled.
- Suggested rollout: high-traffic areas first (living room, kitchen, family room, stairwell).
- Room displays depend on a stable HA dashboard foundation; Iji provides context data, HA renders views.
- Kids routine displays are HA/ESPHome-first infrastructure and can later be surfaced by Iji.
