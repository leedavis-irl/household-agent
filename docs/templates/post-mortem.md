# Post-Mortem: [Short Name]

**Date:** YYYY-MM-DD
**Severity:** Low / Medium / High
**Time to fix:** [duration from discovery to verified fix]

## What Happened

[1-2 sentences: what broke, what was the user-visible impact]

## Incident Log

### Issue 1: [Name]
- **Symptom:** [What was observed — log lines, error messages, missing response]
- **Root Cause:** [Technical explanation]
- **Fix:** [What code/config change resolved it]

### Issue 2: [Name] (if applicable)
- **Symptom:**
- **Root Cause:**
- **Fix:**

## What Our Process Should Have Caught

[Which step in the build cycle (DEV-PROTOCOL.md) failed or was skipped? Be specific.]

## Template Vaccination

[What was updated to prevent this class of bug from recurring?]

| Template/File Updated | What Was Added |
|-----------------------|----------------|
| `docs/templates/spec.md` | [description] |
| `docs/templates/verify.md` | [description] |
| `.cursorrules` | [description] |
| `DEV-PROTOCOL.md` | [description] |

## Lessons Learned

[Broader takeaway beyond the specific fix — pattern to watch for, assumption that was wrong]
