#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/gh-update-card.sh "Card Title" "Status"
# Updates a card in GitHub Project #2 (user: leedavis-irl) to the given status.
# Valid statuses: Backlog, Ready, In progress, In review, Done

CARD_TITLE="${1:?Usage: gh-update-card.sh \"Card Title\" \"Status\"}"
TARGET_STATUS="${2:?Usage: gh-update-card.sh \"Card Title\" \"Status\"}"

PROJECT_ID="PVT_kwHOAVcVpc4BSCAH"
STATUS_FIELD="PVTSSF_lAHOAVcVpc4BSCAHzg_ryew"

# Map status names to option IDs
case "$TARGET_STATUS" in
  "Backlog")      STATUS_ID="f75ad846" ;;
  "Ready")        STATUS_ID="61e4505c" ;;
  "In progress")  STATUS_ID="47fc9ee4" ;;
  "In review")    STATUS_ID="df73e18b" ;;
  "Done")         STATUS_ID="98236657" ;;
  *) echo "Unknown status: $TARGET_STATUS"; echo "Valid: Backlog, Ready, In progress, In review, Done"; exit 1 ;;
esac

# Find the card by title
ITEM_ID=$(python3 -c "
import subprocess, json
cursor = None
while True:
    after = f', after: \"{cursor}\"' if cursor else ''
    q = '{user(login:\"leedavis-irl\"){projectV2(number:2){items(first:100'+after+'){pageInfo{hasNextPage endCursor}nodes{id content{...on DraftIssue{title}...on Issue{title}...on PullRequest{title}}}}}}}'
    r = subprocess.run(['gh','api','graphql','-f',f'query={q}'], capture_output=True, text=True)
    data = json.loads(r.stdout)
    items = data['data']['user']['projectV2']['items']
    for n in items['nodes']:
        if n['content'].get('title','') == '''$CARD_TITLE''':
            print(n['id'])
            exit()
    if not items['pageInfo']['hasNextPage']:
        break
    cursor = items['pageInfo']['endCursor']
")

if [ -z "$ITEM_ID" ]; then
  echo "Card not found: $CARD_TITLE"
  exit 1
fi

# Update the status
gh api graphql \
  -f query='mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) { updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $value}}) { projectV2Item { id } } }' \
  -f project="$PROJECT_ID" \
  -f item="$ITEM_ID" \
  -f field="$STATUS_FIELD" \
  -f value="$STATUS_ID" > /dev/null 2>&1

echo "✓ $CARD_TITLE → $TARGET_STATUS"
