#!/usr/bin/env bash
# Manual rollback: reset server to a previous commit and restart Iji.
# Usage: ./scripts/rollback.sh [COMMIT_SHA]
# If COMMIT_SHA is omitted, rolls back to HEAD~1.
set -e

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lees-alpha-trading.pem}"
DEPLOY_HOST="${DEPLOY_HOST:-3.149.229.204}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/household-agent}"

target="${1:-HEAD~1}"
echo "Rolling back to $target on $DEPLOY_USER@$DEPLOY_HOST ..."
ssh -i "$SSH_KEY" "$DEPLOY_USER@$DEPLOY_HOST" "set -e; cd $DEPLOY_DIR; git fetch origin main; git reset --hard $target; npm ci; sudo systemctl stop iji.service || true; sleep 15; sudo systemctl start iji.service"
echo "Waiting for service..."
sleep 10
status=$(ssh -i "$SSH_KEY" "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active iji.service" || echo failed)
if [[ "$status" == "active" ]]; then
  echo "Rollback OK. iji.service is active."
else
  echo "WARNING: iji.service status is '$status'. Check server."
  exit 1
fi
