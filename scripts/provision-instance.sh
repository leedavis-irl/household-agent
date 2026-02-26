#!/usr/bin/env bash
# Reference-only infrastructure inventory for the Iji EC2 host.
# This is documentation-as-code and is NOT intended for blind execution.
# Review each section and adapt before running on a new host.
set -euo pipefail

echo "== Iji instance inventory =="
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo

echo "## OS version"
cat /etc/os-release
echo

echo "## Runtime binaries"
echo "node:        $(command -v node || true)"
echo "npm:         $(command -v npm || true)"
echo "java:        $(command -v java || true)"
echo "nginx:       $(command -v nginx || true)"
echo "tailscale:   $(command -v tailscale || true)"
echo "cloudflared: $(command -v cloudflared || true)"
echo "signal-cli:  /opt/signal-cli-0.13.24/bin/signal-cli"
echo

echo "## Node install method/version"
# Current host uses NodeSource apt package.
node -v || true
npm -v || true
dpkg -l | grep -E "nodejs|npm" || true
echo

echo "## Java version"
java -version || true
dpkg -l | grep -E "openjdk" || true
echo

echo "## signal-cli version/install path"
/opt/signal-cli-0.13.24/bin/signal-cli --version || true
ls -la /opt/signal-cli-0.13.24 || true
echo

echo "## apt packages (infra-relevant snapshot)"
dpkg -l | grep -E "nodejs|npm|openjdk|nginx|cloudflared|tailscale|sqlite3|jq|git|curl|ca-certificates" || true
echo

echo "## systemd units"
ls -la /etc/systemd/system/iji* /etc/systemd/system/monarch* 2>/dev/null || true
systemctl status iji.service --no-pager || true
echo

echo "## nginx config locations"
ls -la /etc/nginx || true
ls -la /etc/nginx/sites-available || true
ls -la /etc/nginx/sites-enabled || true
echo

echo "## cloudflared config locations"
ls -la /etc/cloudflared 2>/dev/null || true
ls -la "$HOME/.cloudflared" 2>/dev/null || true
systemctl status cloudflared --no-pager 2>/dev/null || true
echo

echo "## tailscale status"
tailscale status || true
echo

echo "## Firewall state"
ufw status || true
iptables -S || true
echo

echo "## Notes"
echo "- SSH access path should be Tailscale (host: 100.124.0.46)."
echo "- Public SSH has shown intermittent banner-exchange failures."
echo "- Keep AMI snapshots current after infra changes."
