#!/usr/bin/env bash
# Manual deploy: push latest main to EC2 and restart Iji.
# Run from repo root. Ensure you've pushed to main first (or push with --push).
# Usage: ./scripts/deploy.sh [--push]
set -e

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lees-alpha-trading.pem}"
DEPLOY_HOST="${DEPLOY_HOST:-100.124.0.46}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/household-agent}"

if [[ "$1" == "--push" ]]; then
  git push origin main
fi

echo "Deploying to $DEPLOY_USER@$DEPLOY_HOST ..."
ssh -i "$SSH_KEY" "$DEPLOY_USER@$DEPLOY_HOST" "set -e; cd $DEPLOY_DIR; git fetch origin main; git reset --hard origin/main; npm ci; sudo systemctl stop iji.service || true; sleep 15; sudo systemctl start iji.service"
echo "Waiting for service..."
sleep 10
status=$(ssh -i "$SSH_KEY" "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active iji.service" || echo failed)
if [[ "$status" == "active" ]]; then
  echo "Deploy OK. iji.service is active."
else
  echo "WARNING: iji.service status is '$status'. Check server."
  exit 1
fi
