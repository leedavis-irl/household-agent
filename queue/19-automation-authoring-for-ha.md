# Automation authoring for HA

**Sphere:** Engine
**Backlog item:** Automation authoring for HA
**Depends on:** ha_control, ha_scene, ha_query tools

## What to build

Let Iji draft Home Assistant automations from natural language descriptions, preview them for approval, and deploy them to HA. Requires an explicit approval workflow — Iji never deploys an automation without human confirmation.

## Context

HA automations are YAML configs. The HA REST API supports creating automations via `/api/config/automation/config/{id}`. Existing ha_control.js shows the fetch pattern. This is a high-trust capability — the approval workflow is critical.

## Implementation notes

Create `src/tools/ha-automation-author.js` with two actions: `draft` (generates YAML from natural language, returns for review) and `deploy` (sends approved YAML to HA API). The draft step should use Claude's reasoning to translate intent to HA automation YAML. Store drafts in memory with an ID so the user can say 'deploy automation #3'.

## Server requirements

- [ ] HA long-lived token must have automation config permissions

## Verification

- Ask Iji: "Create an automation that turns on porch lights at sunset" → Returns YAML draft for review
- Say "looks good, deploy it" → Sends to HA config API
- Ask Iji: "Create an automation that locks all doors at midnight" → Draft with approval step

## Done when

- [ ] `ha_automation_author` tool with draft and deploy actions
- [ ] Approval workflow — never auto-deploys
- [ ] Generated YAML is valid HA automation format
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Automation authoring for HA" "In Review"
```

## Commit message

`feat: add HA automation authoring with approval workflow`
