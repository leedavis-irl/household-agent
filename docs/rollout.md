# Iji Rollout Tracker

This file answers one question: who can use what today, end-to-end.

## Capability Access Matrix

| Capability | Lee | Steve | Kelly | Hallie | Firen | Blocker for others |
|-----------|-----|-------|-------|--------|-------|--------------------|
| Signal DM to Iji | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Calendar query | ✅ | ❌ | ✅ | ✅ | ❌ | Steve + Firen need `calendar_id` in config |
| Calendar create/modify | ✅ | ❌ | ✅ | ✅ | ❌ | Same |
| Calendar freebusy | ✅ | ❌ | ✅ | ✅ | ❌ | Same |
| HA query | ✅ | ✅ | ✅ | ✅ | ✅ | Untested by others |
| HA control | ✅ | ✅ | ✅ | ✅ | ✅ | Untested by others |
| Knowledge search/store | ✅ | ✅ | ✅ | ✅ | ✅ | Untested by others |
| Message relay | ✅ | ✅ | ✅ | ✅ | ✅ | Untested by others |
| Weather | ✅ | ✅ | ✅ | ✅ | ✅ | Untested by others |
| Email search/read | ✅ | ❌ | ❌ | ❌ | ❌ | Each person must run OAuth flow |
| Finance transactions | ✅ | ❌ | ❌ | ❌ | ❌ | Others lack `financial` permission |
| Finance paybacks | ❌ | ❌ | ❌ | ❌ | ❌ | State file not on EC2 |
| Cost query | ✅ | ❌ | ❌ | ❌ | ❌ | Others lack `financial` permission |

## Per-Person Facts

### Lee
- [x] Signal identity configured
- [x] Calendar connected (`calendar_id`)
- [x] Gmail OAuth token present
- [x] `financial` permission
- [ ] Introduced to Iji onboarding flow

### Steve
- [x] Signal identity configured
- [ ] Calendar connected (`calendar_id`)
- [ ] Gmail OAuth token present
- [ ] `financial` permission
- [ ] Introduced to Iji onboarding flow

### Kelly
- [x] Signal identity configured
- [x] Calendar connected (`calendar_id`)
- [ ] Gmail OAuth token present
- [ ] `financial` permission
- [ ] Introduced to Iji onboarding flow

### Hallie
- [x] Signal identity configured
- [x] Calendar connected (`calendar_id`)
- [ ] Gmail OAuth token present
- [ ] `financial` permission
- [ ] Introduced to Iji onboarding flow

### Firen
- [x] Signal identity configured
- [ ] Calendar connected (`calendar_id`)
- [ ] Gmail OAuth token present
- [ ] `financial` permission
- [ ] Introduced to Iji onboarding flow
