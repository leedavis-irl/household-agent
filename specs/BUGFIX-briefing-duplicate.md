# Spec: Bugfix — Morning Briefing Duplicate on Restart

**Post-mortem:** `docs/post-mortems/2026-02-26-briefing-duplicate-on-deploy.md`
**Severity:** Low (cosmetic — duplicate briefing, no data loss)
**Type:** Simple bugfix (prescriptive)

## Problem

The `sentToday` in-memory Set in `src/utils/morning-briefing.js` is cleared on process restart. Since the scheduler uses `hour >= delivery_hour`, any deploy after the briefing hour causes a duplicate.

## Fix

Before sending a briefing, check if one has already been sent today by querying the `conversation_evals` table for a matching `conversation_id`. The briefing already uses `briefing-${personId}-${dateKey}` as its conversation_id, and the eval logger records every completed brain loop.

In `src/utils/morning-briefing.js`, before calling `think()` for a person:

1. Query: does a row exist in `conversation_evals` where `conversation_id = 'briefing-${personId}-${dateKey}'`?
2. If yes, skip (already sent today). Add to `sentToday` set to avoid repeated DB queries on subsequent cycles.
3. If no, proceed with sending.

This makes the deduplication survive restarts without adding a new table.

## Files to Modify

- `src/utils/morning-briefing.js` — add persistent dedup check before sending

## Commit Message

```
fix: prevent duplicate morning briefings on service restart

- Check conversation_evals table before sending (persists across restarts)
- In-memory sentToday set now acts as cache, not source of truth
- Post-mortem: docs/post-mortems/2026-02-26-briefing-duplicate-on-deploy.md
```

## Verification

- [ ] Deploy after briefing hour → no duplicate briefing sent
- [ ] Next morning → briefing still fires normally at delivery_hour
- [ ] `sentToday` set still prevents repeated DB queries within a single process lifetime
