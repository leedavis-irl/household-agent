# Asset registry

**Sphere:** Engine
**Backlog item:** Asset registry
**Depends on:** none

## What to build

Give Iji a household asset registry — every major appliance, piece of furniture, and valuable item tracked with brand, model, purchase date, warranty expiration, location, and notes. Evaluate Homebox as the backend per Growth Protocol.

## Context

ARCHITECTURE.md lists 'Household Inventory & Stores' as Department 6. Growth Protocol mentions evaluating Homebox (https://github.com/hay-kot/homebox). The simplest v1: a SQLite table in Iji's own database, queryable via a tool. Homebox integration can come later.

## Implementation notes

Add `assets` table via DB migration (name, brand, model, purchase_date, warranty_expires, location, notes, category). Create `src/tools/asset-query.js` (search/list assets) and `src/tools/asset-store.js` (add/update assets). Register both with appropriate permissions.

## Server requirements

- [ ] DB migration runs automatically on restart

## Verification

- Ask Iji: "Add the new dishwasher — Bosch 800 series, bought today, 2-year warranty" → Creates asset record
- Ask Iji: "What appliances are in the kitchen?" → Lists kitchen assets
- Ask Iji: "When does the dishwasher warranty expire?" → Returns warranty date

## Done when

- [ ] `assets` table created via migration
- [ ] `asset_query` and `asset_store` tools working
- [ ] Search by name, location, and category
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Asset registry" "In Review"
```

## Commit message

`feat: add household asset registry with query and store tools`
