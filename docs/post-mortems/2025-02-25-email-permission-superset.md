# Post-Mortem: Email Permission Superset Bug

**Date:** 2025-02-25
**Severity:** Medium
**Time to fix:** ~2 hours from discovery to verified fix

## What Happened

Lee attempted to use Gmail search through Iji and was denied, even though she had admin-level email access. The denial was caused by inner permission checks treating own-email access as `email_own` only.

## Incident Log

### Issue 1: `email_all` did not imply `email_own`
- **Symptom:** Lee (admin with `email_all`) got permission denied when searching/reading her own email.
- **Root Cause:** `checkEmailPermission()` in both `email-search.js` and `email-read.js` checked `email_own` for self-queries without first treating `email_all` as a superset.
- **Fix:** Updated inner permission checks to return allowed immediately when `email_all` is present. Added `email_own` to Lee's config as belt+suspenders.

## What Our Process Should Have Caught

The verification flow did not test the double-gate pattern (outer gate in `permissions.js` plus inner gate in the tool) for a superset user. We tested permission-denied and standard happy paths, but did not explicitly test `_all` users accessing their own resources.

## Template Vaccination

| Template/File Updated | What Was Added |
|-----------------------|----------------|
| `docs/templates/spec.md` | Guidance to enforce `_all` implies `_own` for tools with inner permission checks, with post-mortem reference. |
| `docs/templates/verify.md` | Rollout section requiring per-person end-to-end checks and blocker documentation. |
| `.cursorrules` | Rule 8: Superset Rule — never check `_own` without checking `_all` first. |
| `DEV-PROTOCOL.md` | No direct change; existing process now reinforced via updated templates/rules. |

## Lessons Learned

Permission bugs in this codebase can hide in inner tool logic even when the global permission gate is correct. Any tool with layered permission checks must include explicit superset tests (`_all` user accessing own resource) before rollout is considered complete.
