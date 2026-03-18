#!/usr/bin/env bash
# Install gitleaks pre-commit hook.
# Requires: gitleaks (brew install gitleaks)
set -euo pipefail

HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
HOOK_FILE="${HOOK_DIR}/pre-commit"

if ! command -v gitleaks &>/dev/null; then
  echo "gitleaks not found. Install it first:"
  echo "  brew install gitleaks"
  exit 1
fi

cat > "${HOOK_FILE}" << 'HOOK'
#!/usr/bin/env bash
# Gitleaks pre-commit hook — scan staged changes for secrets
gitleaks protect --staged --config="$(git rev-parse --show-toplevel)/.gitleaks.toml" --verbose
HOOK

chmod +x "${HOOK_FILE}"
echo "Pre-commit hook installed at ${HOOK_FILE}"
