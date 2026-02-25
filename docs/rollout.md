# Iji Rollout Tracker

Per-person rollout status pulled from `config/household.json` and current OAuth token state.

Legend: ✅ done / ⏳ pending / n/a not applicable

## Household Rollout Table

| Person | Role | Signal identity resolved | Calendar connected (`calendar_id`) | Gmail OAuth authorized | Monarch access | Onboarding introduced to Iji | Permissions |
|--------|------|--------------------------|------------------------------------|------------------------|----------------|------------------------------|-------------|
| Lee | admin | ✅ (signal + UUID) | ✅ | ✅ (token present) | ✅ | ⏳ | `ha_all`, `calendar_all`, `knowledge_all`, `financial`, `message_send`, `email_all`, `email_own` |
| Steve | adult | ✅ (signal + UUID) | ⏳ | ⏳ | ⏳ | ⏳ | `ha_office`, `ha_common`, `calendar_own`, `calendar_household`, `knowledge_all`, `message_send`, `email_own` |
| Kelly | adult | ✅ (signal + UUID) | ✅ | ⏳ | ⏳ | ⏳ | `ha_office`, `ha_common`, `calendar_own`, `calendar_household`, `knowledge_all`, `message_send`, `email_own` |
| Hallie | adult | ✅ (signal + UUID) | ✅ | ⏳ | ⏳ | ⏳ | `ha_office`, `ha_common`, `calendar_own`, `calendar_household`, `knowledge_all`, `message_send`, `email_own` |
| Firen | adult | ✅ (signal + UUID) | ⏳ | ⏳ | ⏳ | ⏳ | `ha_office`, `ha_common`, `calendar_own`, `calendar_household`, `knowledge_all`, `message_send`, `email_own` |
| Ryker | child | ⏳ (no signal identifier) | ✅ | n/a | n/a | ⏳ | `ha_common`, `knowledge_read` |
| Logan | child | ⏳ (no signal identifier) | ✅ | n/a | n/a | ⏳ | `ha_common`, `knowledge_read` |
| Hazel | child | ⏳ (no signal identifier) | ✅ | n/a | n/a | ⏳ | `ha_common`, `knowledge_read` |
| DJ | child | ⏳ (no signal identifier) | ✅ | n/a | n/a | ⏳ | `ha_common`, `knowledge_read` |

## Notes

- Gmail OAuth currently has a token for Lee only (`data/oauth-tokens.json`).
- Monarch access is effectively tied to `financial` permission (currently Lee only in config).
- Child members currently have CLI identifiers but no Signal identifiers configured.
- Onboarding status is tracked as pending for everyone until explicitly marked complete in this file.

## Per-Person Checklists

### Lee
- [x] Signal identity resolved
- [x] Calendar connected
- [x] Gmail OAuth authorized
- [x] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Steve
- [x] Signal identity resolved
- [ ] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Kelly
- [x] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Hallie
- [x] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Firen
- [x] Signal identity resolved
- [ ] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Ryker
- [ ] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Logan
- [ ] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### Hazel
- [ ] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete

### DJ
- [ ] Signal identity resolved
- [x] Calendar connected
- [ ] Gmail OAuth authorized
- [ ] Monarch access
- [x] Permissions loaded from config
- [ ] Onboarding complete
