#!/usr/bin/env bash
# setup-github-guardrails.sh
#
# Applies the GitHub repository guardrails for leedavis-irl/household-agent.
# Run this once to configure branch protection and GitHub Environments.
# Safe to re-run — all operations are idempotent.
#
# Prerequisites:
#   - gh CLI authenticated as a repo admin (leedavis-irl)
#   - jq installed
#
# Usage:
#   bash scripts/setup-github-guardrails.sh

set -euo pipefail

REPO="leedavis-irl/household-agent"

echo "=== Configuring GitHub Environments ==="

echo "Creating staging environment (no approval required)..."
gh api repos/$REPO/environments/staging \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'STAGING_EOF'
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [],
  "deployment_branch_policy": null
}
STAGING_EOF
echo "  staging: OK"

echo "Creating production environment (approval required from leedavis-irl)..."
OWNER_ID=$(gh api users/leedavis-irl --jq '.id')
gh api repos/$REPO/environments/production \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<PROD_EOF
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [{"type": "User", "id": $OWNER_ID}],
  "deployment_branch_policy": null
}
PROD_EOF
echo "  production: OK (reviewer: leedavis-irl)"

echo ""
echo "=== Configuring Branch Protection on main ==="

gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'BRANCH_EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      {"context": "gitleaks"},
      {"context": "test"}
    ]
  },
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "enforce_admins": false,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
BRANCH_EOF

echo "  Branch protection on main: OK"
echo "    - PRs required before merge"
echo "    - Required checks: gitleaks, test (npm test via ci.yml)"
echo "    - CODEOWNERS review required (see .github/CODEOWNERS)"
echo "    - Stale review dismissal enabled"
echo "    - Force pushes blocked"
echo "    - Branch deletion blocked"

echo ""
echo "=== Summary ==="
echo "Environments:      staging (no gate), production (leedavis-irl approval)"
echo "Branch protection: PR + CI required, CODEOWNERS enforced"
echo "Workflows:         ci.yml (tests on PR), deploy.yml (prod), deploy-staging.yml (staging)"
echo ""
echo "Done. Guardrails are active."
