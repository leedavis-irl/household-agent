# Post-Mortem: Morning Briefing Duplicate on Deploy

**Date:** 2026-02-26
**Severity:** Low
**Time to fix:** TBD (in progress)

## What Happened

Lee received a second morning briefing after the backlog reconciliation commit deployed. The briefing should fire once per person per day.

## Root Cause

The v1 timing fix changed the scheduler check from `hour === X && minute === 0` (exact match) to `hour >= delivery_hour` (window-based). This correctly ensures briefings fire even if the process restarts mid-morning. However, the deduplication mechanism — an in-memory `Set` called `sentToday` — does not survive process restarts.

When CI deployed the backlog commit, `iji.service` restarted. The `sentToday` set was empty. The scheduler ran its first cycle, saw `hour >= 9` (true), saw the set was empty (no record of today's briefing), and fired a duplicate.

This will happen on every deploy that lands after the briefing hour.

## Fix

Replace the in-memory `sentToday` Set with a persistent check. Two options:

**Option A (recommended): Query the database.** The eval logger already records every brain loop with a `conversation_id`. Morning briefings use `briefing-${personId}-${dateKey}` as their conversation_id. Before sending, query the eval table for a matching conversation_id. If found, skip.

**Option B: SQLite table.** Add a `briefing_sent` table with `person_id` and `date` columns. Write a row after each successful send. Check before sending.

Option A is preferred because it requires no schema change — the data already exists.

## What Our Process Should Have Caught

The verification checklist (`specs/MORNING-BRIEFINGS-V1.verify.md`) has a "No double-send" test, but it only tested waiting 2+ minutes within a single process lifetime. It did not test the restart scenario. The timing fix specifically enables restart resilience (fire late if restarted after the hour), but we didn't think through the deduplication implication of that same restart.

## Template Vaccination

- Update verification checklist template to include: "Restart the service after the feature has fired — confirm it does not fire again"
- Any scheduler that uses in-memory deduplication should be flagged during spec review
