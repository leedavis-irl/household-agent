# Verification: Morning Briefing Opt-In/Out

## Tool Tests (CLI)

### briefing_status — default state
1. As Lee (who has `briefing.enabled: true` in household.json): call `briefing_status`
   - **Expected:** `{ subscribed: true, delivery_hour: 9, source: "default" }`
2. As Steve (no briefing config in household.json): call `briefing_status`
   - **Expected:** `{ subscribed: false, source: "default" }`

### briefing_subscribe — opt out
3. As Lee: call `briefing_subscribe` with `{ enabled: false }`
   - **Expected:** `{ status: "unsubscribed" }`
4. As Lee: call `briefing_status`
   - **Expected:** `{ subscribed: false, source: "preference" }`

### briefing_subscribe — opt in (new subscriber)
5. As Steve: call `briefing_subscribe` with `{ enabled: true, delivery_hour: 8 }`
   - **Expected:** `{ status: "subscribed", delivery_hour: 8 }`
6. As Steve: call `briefing_status`
   - **Expected:** `{ subscribed: true, delivery_hour: 8, source: "preference" }`

### briefing_subscribe — change hour only
7. As Lee: call `briefing_subscribe` with `{ enabled: true, delivery_hour: 7 }`
   - **Expected:** `{ status: "subscribed", delivery_hour: 7 }`

### briefing_subscribe — validation
8. Call with `{ enabled: true, delivery_hour: 25 }`
   - **Expected:** Error about invalid delivery_hour
9. Call with `{ enabled: true, delivery_hour: -1 }`
   - **Expected:** Error about invalid delivery_hour

### Permissions
10. As Ryker (child): call `briefing_subscribe`
    - **Expected:** Permission denied

## Scheduler Integration

11. With Lee opted out via SQLite preference: verify morning briefing cycle skips Lee
12. With Steve opted in via SQLite preference: verify morning briefing cycle includes Steve
13. With no SQLite row for Kelly and `briefing.enabled: true` in household.json: verify Kelly still gets briefings (fallback works)

## Regression

14. `npm test` passes (if tests exist)
15. Existing morning briefing still fires for Kelly (unchanged config)
16. No changes to files outside spec scope
