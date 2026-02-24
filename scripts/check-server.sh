#!/usr/bin/env bash
# Run from your Mac to verify EC2 is ready for deploy.
# Usage: ./scripts/check-server.sh
# Server reality: node at /usr/bin/node, signal-cli at /opt/signal-cli-0.13.24/bin/signal-cli, iji.service in systemd.
set -e

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lees-alpha-trading.pem}"
HOST="${DEPLOY_HOST:-3.149.229.204}"
USER="${DEPLOY_USER:-ubuntu}"
DIR="${DEPLOY_DIR:-/home/ubuntu/household-agent}"
SIGNAL_CLI_PATH="${SIGNAL_CLI_PATH:-/opt/signal-cli-0.13.24/bin/signal-cli}"

run() { ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$USER@$HOST" "$@"; }

echo "Checking $USER@$HOST (app dir: $DIR) ..."
echo ""

check() { if run "$@" >/dev/null 2>&1; then echo "  OK: $1"; return 0; else echo "  MISS: $1"; return 1; fi }

ok=0
check "app dir exists" "[ -d $DIR ]" || ok=1
check "package.json" "[ -f $DIR/package.json ]" || ok=1
check "node_modules" "[ -d $DIR/node_modules ]" || ok=1
check "config/household.json" "[ -f $DIR/config/household.json ]" || ok=1
check ".env" "[ -f $DIR/.env ]" || ok=1
check "data dir" "[ -d $DIR/data ]" || ok=1
check ".git (for deploy)" "[ -d $DIR/.git ]" || ok=1
check "iji.service unit" "systemctl cat iji.service >/dev/null 2>&1" || ok=1
check "iji.service active" 'test "$(systemctl is-active iji.service 2>/dev/null)" = active' || ok=1
check "signal-cli at /opt/signal-cli-0.13.24/bin/signal-cli" "[ -x $SIGNAL_CLI_PATH ]" || ok=1

echo ""
if [ $ok -eq 0 ]; then
  echo "All checks passed. Server is ready for deploy."
else
  echo "Some checks failed. Fix and re-run, or see docs/deploy.md."
  exit 1
fi
