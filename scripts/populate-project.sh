#!/usr/bin/env bash
set -euo pipefail

# ── IDs from GraphQL discovery ──
PROJECT_ID="PVT_kwHOAVcVpc4BSCAH"
STATUS_FIELD="PVTSSF_lAHOAVcVpc4BSCAHzg_ryew"
STATUS_BACKLOG="f75ad846"
PROJECTS_FIELD="PVTSSF_lAHOAVcVpc4BSCAHzg_r3CE"
PROJECTS_IJI="1c822c06"
SPHERES_FIELD="PVTSSF_lAHOAVcVpc4BSCAHzg_sX5Y"
SUMMARY_FIELD="PVTF_lAHOAVcVpc4BSCAHzg_saHU"

# ── Sphere mapping: BACKLOG section → GitHub Project Spheres option ID ──
sphere_id_for() {
  case "$1" in
    "Scheduling & Coordination") echo "7612fe2e" ;;  # Scheduling & Logistics
    "Communication")             echo "e183b2bf" ;;  # People & Relationships
    "Email & Documents")         echo "7eb25b06" ;;  # Iji Engine
    "Finances")                  echo "6730c616" ;;  # Finances
    "Home Operations")           echo "f386eff9" ;;  # Property & Home
    "Meals & Kitchen")           echo "4c59f6b5" ;;  # Meals & Kitchen
    "Children")                  echo "27a5fd88" ;;  # Children
    "Weather & Daily Ops")       echo "7612fe2e" ;;  # Scheduling & Logistics
    "Maintenance & Property")    echo "f386eff9" ;;  # Property & Home
    "Institutional Memory")      echo "7eb25b06" ;;  # Iji Engine
    "Vehicles & Transport")      echo "47915aaa" ;;  # Procurement & Errands
    "Entertaining & Hospitality") echo "e183b2bf" ;; # People & Relationships
    "Procurement")               echo "47915aaa" ;;  # Procurement & Errands
    "Meta & Infrastructure")     echo "7eb25b06" ;;  # Iji Engine
    "Housekeeping & Hygiene")    echo "f386eff9" ;;  # Property & Home
    *) echo "" ;;
  esac
}

# ── Skip list (9 manually created cards) ──
SKIP=(
  "Household conflict detection"
  "Morning briefing opt-in/out"
  "Morning briefing + Trello tasks"
  "Multi-person scheduling negotiation"
  "Slack channel adapter"
  "Email as a channel (inbound/outbound)"
  "Voice channel adapter"
  "Draft email for review"
  "Room tablets (Peninsula-style)"
)

is_skipped() {
  local name="$1"
  for s in "${SKIP[@]}"; do
    [[ "$s" == "$name" ]] && return 0
  done
  return 1
}

# ── Counters ──
total=0; skipped=0; created=0; failed=0
inc_total()   { total=$((total+1)); }
inc_skipped() { skipped=$((skipped+1)); }
inc_created() { created=$((created+1)); }
inc_failed()  { failed=$((failed+1)); }

# ── Create a draft card and set fields ──
create_card() {
  local title="$1" sphere_id="$2" summary="$3"

  # Step 1: create draft issue
  local result
  result=$(gh api graphql -f query='
    mutation($projectId: ID!, $title: String!) {
      addProjectV2DraftIssue(input: {projectId: $projectId, title: $title}) {
        projectItem { id }
      }
    }' -f projectId="$PROJECT_ID" -f title="$title" 2>&1) || {
    echo "  FAIL (create): $title — $result"
    inc_failed
    return
  }

  local item_id
  item_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['addProjectV2DraftIssue']['projectItem']['id'])" 2>/dev/null) || {
    echo "  FAIL (parse ID): $title — $result"
    inc_failed
    return
  }

  # Step 2: set Status=Backlog
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $value}}) {
        projectV2Item { id }
      }
    }' -f project="$PROJECT_ID" -f item="$item_id" -f field="$STATUS_FIELD" -f value="$STATUS_BACKLOG" >/dev/null 2>&1

  # Step 3: set Projects=Iji
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $value}}) {
        projectV2Item { id }
      }
    }' -f project="$PROJECT_ID" -f item="$item_id" -f field="$PROJECTS_FIELD" -f value="$PROJECTS_IJI" >/dev/null 2>&1

  # Step 4: set Spheres
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $value}}) {
        projectV2Item { id }
      }
    }' -f project="$PROJECT_ID" -f item="$item_id" -f field="$SPHERES_FIELD" -f value="$sphere_id" >/dev/null 2>&1

  # Step 5: set Short Summary
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {text: $value}}) {
        projectV2Item { id }
      }
    }' -f project="$PROJECT_ID" -f item="$item_id" -f field="$SUMMARY_FIELD" -f value="$summary" >/dev/null 2>&1

  echo "  OK: $title"
  inc_created
}

# ── Card definitions: (sphere, title, summary) ──
# Parsed from BACKLOG.md — all ❌ Not built capabilities, minus 9 skip list

add() {
  local sphere="$1" title="$2" summary="$3"
  inc_total
  if is_skipped "$title"; then
    echo "  SKIP: $title"
    inc_skipped
    return
  fi
  local sphere_id
  sphere_id=$(sphere_id_for "$sphere")
  if [[ -z "$sphere_id" ]]; then
    echo "  FAIL (no sphere mapping): $title [$sphere]"
    inc_failed
    return
  fi
  create_card "$title" "$sphere_id" "$summary"
}

echo "=== Populating GitHub Project #2 from BACKLOG.md ==="
echo ""

# ── 1) Scheduling & Coordination ──
echo "Scheduling & Coordination:"
add "Scheduling & Coordination" "Household conflict detection" "Detect double-bookings, kid pickup conflicts, shared-car conflicts"
add "Scheduling & Coordination" "Morning briefing opt-in/out" "Adults can subscribe/unsubscribe from daily briefing"
add "Scheduling & Coordination" "Morning briefing + Trello tasks" "Pull Lee + Kelly's Trello boards, fit actionable tasks into the day's schedule"
add "Scheduling & Coordination" "Multi-person scheduling negotiation" "Reasoning layer on top of freebusy"

# ── 2) Communication ──
echo "Communication:"
add "Communication" "Slack channel adapter" "Architecture supports it; implementation pending"
add "Communication" "Slack message search" "Needs Slack API integration + auth"
add "Communication" "Email as a channel (inbound/outbound)" "Distinct from Gmail search/read tools"
add "Communication" "Voice channel adapter" "Wyoming/STT/TTS path documented in architecture"

# ── 3) Email & Documents ──
echo "Email & Documents:"
add "Email & Documents" "Draft email for review" "Requires Gmail modify scope + per-user OAuth"
add "Email & Documents" "Search shared Drive docs" "Needs Drive API tool"
add "Email & Documents" "Read Google Docs content" "Needs Drive/Docs read tools"
add "Email & Documents" "Generate operational documents" "Packing lists, summaries, prep docs, reports"

# ── 4) Finances ──
echo "Finances:"
add "Finances" "Bill due reminders" "Proactive bill reminder feature"

# ── 5) Home Operations ──
echo "Home Operations:"
add "Home Operations" "Ambient automation (lights/blinds/climate)" "Revisit as Iji-native capability with event batching, cost ceiling, action memory, opt-in scope"
add "Home Operations" "Scene/automation triggers" "Planned HA service tooling"
add "Home Operations" "Historical state analysis" "Planned HA history endpoint tool"
add "Home Operations" "HA notification dispatch" "Planned HA notify tools"
add "Home Operations" "Anomaly detection over sensors" "Interpreted anomaly alerts (door/water/temp)"
add "Home Operations" "Presence inference engine" "Probabilistic presence from multi-source signals"
add "Home Operations" "HA automation authoring" "Draft/deploy automations with approval workflow"
add "Home Operations" "Camera/image understanding" "Doorbell/fridge/room context via vision inputs"
add "Home Operations" "Wall/room display intelligence layer" "Dynamic context output for room displays"
add "Home Operations" "Room tablets (Peninsula-style)" "Fire tablets docked in every major room with dashboard + voice Iji"
add "Home Operations" "Physical world orchestration" "Vacuum/sprinklers/laundry coordination from context"

# ── 6) Meals & Kitchen ──
echo "Meals & Kitchen:"
add "Meals & Kitchen" "Recipe memory + ratings" "Seed from Firen's spreadsheet"
add "Meals & Kitchen" "Weekly menu management" "Chef proposal + household feedback cycle"
add "Meals & Kitchen" "Post-meal feedback capture" "Depends on outreach + recipe DB"
add "Meals & Kitchen" "Chef communication automation" "SMS channel (Twilio) is prerequisite"
add "Meals & Kitchen" "Kitchen inventory + meal ops" "Extend into pantry/inventory tracking"

# ── 7) Children ──
echo "Children:"
add "Children" "AM/PM routine tracking" "Depends on HA/ESPHome routine hardware flow"
add "Children" "School/activity schedule assistant" "Calendar + reminders + coordination"
add "Children" "Medical/permission-slip tracking" "Structured records + reminders needed"
add "Children" "Homework tracking support" "Child-focused workflow"

# ── 8) Weather & Daily Ops ──
echo "Weather & Daily Ops:"
add "Weather & Daily Ops" "Outfit/departure guidance" "Uses weather + calendar + routines"
add "Weather & Daily Ops" "Severe weather alerts" "Proactive trigger infrastructure required"
add "Weather & Daily Ops" "Daily departure checklist" "Intended for front-door display and messaging"
add "Weather & Daily Ops" "Anticipatory daily operations" "Event-driven proactive nudges (weather/calendar/email context)"

# ── 9) Maintenance & Property ──
echo "Maintenance & Property:"
add "Maintenance & Property" "Maintenance/service log" "Appliance/service history"
add "Maintenance & Property" "Contractor/vendor contacts" "Address book + context by trade"
add "Maintenance & Property" "Warranty tracking" "Could integrate with asset registry"
add "Maintenance & Property" "Service scheduling reminders" "Seasonal + interval reminders"
add "Maintenance & Property" "Grounds/landscape task tracking" "Linked to maintenance operations"
add "Maintenance & Property" "Vendor coordination lifecycle" "Draft/follow-up coordination for contractors with human approval"

# ── 10) Institutional Memory ──
echo "Institutional Memory:"
add "Institutional Memory" "Preference profiles (learned)" "Confidence-scored learned preferences"
add "Institutional Memory" "Routine detection" "Batch analytics over prior behavior"
add "Institutional Memory" "Feedback loops on suggestions" "Improve recommendations over time"
add "Institutional Memory" "Forgetting curves / TTL tiers" "Long-term memory hygiene"
add "Institutional Memory" "Institutional procedures/runbooks" "Repeatable process memory"
add "Institutional Memory" "Decision log with rationale" "Durable household decision context"
add "Institutional Memory" "Passive group fact extraction" "Requires explicit privacy decision"

# ── 11) Vehicles & Transport ──
echo "Vehicles & Transport:"
add "Vehicles & Transport" "Transit directions" "Google Maps API integration"
add "Vehicles & Transport" "Vehicle maintenance schedule" "Recurring reminders + records"
add "Vehicles & Transport" "Registration/insurance tracking" "Renewal reminders + document refs"
add "Vehicles & Transport" "Parking/charging logistics" "Coordination + reminder workflows"
add "Vehicles & Transport" "Apple Find My item/device locate" "Via FindMySync Mac app to HA device_tracker"

# ── 12) Entertaining & Hospitality ──
echo "Entertaining & Hospitality:"
add "Entertaining & Hospitality" "Guest list and visitor profiles" "Frequent visitor + context memory"
add "Entertaining & Hospitality" "Event planning checklists" "Could use document-generation capability"
add "Entertaining & Hospitality" "Guest room readiness workflow" "Crosses home ops + inventory"
add "Entertaining & Hospitality" "Social obligation tracking (RSVP/gifts)" "Correspondence + reminders"

# ── 13) Procurement ──
echo "Procurement:"
add "Procurement" "Safeway staples list management" "Shared list + approval model"
add "Procurement" "Skip recurring delivery" "Needs reverse-engineered Safeway API"
add "Procurement" "Sync staples to Safeway order" "Depends on auth/session stability"
add "Procurement" "Package/delivery tracking" "Parse email + carrier tracking"
add "Procurement" "Proactive restocking recommendations" "Inventory + spend pattern intelligence"
add "Procurement" "Meal planning + grocery coordination intelligence" "Dietary preferences + purchase patterns into plan suggestions"

# ── 14) Meta & Infrastructure ──
echo "Meta & Infrastructure:"
add "Meta & Infrastructure" "Security hardening wave" "Scope audits, key rotation, access review, abuse controls"
add "Meta & Infrastructure" "Web search capability" "Evaluate Brave/Tavily/SerpAPI"
add "Meta & Infrastructure" "Tool authoring (self-extension)" "Meta-cognitive capability"
add "Meta & Infrastructure" "Confidence calibration" "Staleness-aware confidence outputs"
add "Meta & Infrastructure" "Escalation intelligence" "Autonomy boundary learning"
add "Meta & Infrastructure" "Conversation quality self-review" "Follow-up quality checks"
add "Meta & Infrastructure" "Relationship graph" "Evaluate Monica per Growth Protocol"
add "Meta & Infrastructure" "Asset registry" "Evaluate Homebox per Growth Protocol"
add "Meta & Infrastructure" "Automation authoring for HA" "Approval workflow required"

# ── 15) Housekeeping & Hygiene ──
echo "Housekeeping & Hygiene:"
add "Housekeeping & Hygiene" "HA entity naming cleanup" "Multiple entity_id / friendly_name mismatches in HA and Hue"

echo ""
echo "=== DONE ==="
echo "Total parsed: $total"
echo "Skipped: $skipped"
echo "Created: $created"
echo "Failed: $failed"
