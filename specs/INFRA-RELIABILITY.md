# Spec: Infrastructure Reliability

**Decision:** `docs/decisions/2026-02-25-infra-reliability.md`
**Backlog bucket:** Meta & Infrastructure

## Problem

EC2 public IP SSH has failed three times, each costing hours of troubleshooting. Root causes vary (host networking, status check timing, unknown) but the pattern is consistent: public SSH is unreliable on this instance class and we keep losing time to it.

## Solution: Three layers

### Layer 1: Tailscale for all SSH (eliminates the failure mode)

Migrate all SSH — CI/CD and manual scripts — from public IP to Tailscale IP.

**CI/CD workflow (`.github/workflows/deploy.yml`):**
- Add [tailscale/github-action](https://github.com/tailscale/github-action) as first step
- Uses an ephemeral auth key (OAuth client, tag `tag:ci`) to join the tailnet for the duration of the workflow
- Replace `DEPLOY_HOST` env var with Tailscale IP `100.124.0.46`
- Remove `ssh-keyscan` step (Tailscale handles identity)
- Keep `StrictHostKeyChecking=accept-new` for first-run

**Required GitHub Secrets:**
- `TS_OAUTH_CLIENT_ID` — from Tailscale admin console → Settings → OAuth clients
- `TS_OAUTH_SECRET` — same

**Required Tailscale ACL changes:**
- Create tag `tag:ci` in ACL policy
- Grant `tag:ci` SSH access to the EC2 node

**Manual scripts (`scripts/deploy.sh`, `scripts/check-server.sh`, `scripts/rollback.sh`):**
- Change default `DEPLOY_HOST` from public IP to `100.124.0.46`
- These already work over Tailscale from Lee's Mac (same tailnet)

### Layer 2: Elastic IP (prevents IP churn for non-SSH services)

Allocate an Elastic IP and associate with instance `i-05f42459cc577ee50`. This is for:
- Any future webhook endpoints
- As a stable fallback reference

This does NOT need to be the SSH path. SSH goes through Tailscale.

### Layer 3: AMI snapshot (disaster recovery)

After successful deploy, create an AMI snapshot of the running instance. This captures:
- Ubuntu OS + packages
- Java runtime + signal-cli binary
- signal-cli account link (the painful part to redo)
- Node.js, systemd units, nginx config
- Cloudflare tunnel config

**Recovery from AMI:** Launch new instance → attach Elastic IP → `git pull && npm ci && systemctl start iji` → done in 5 minutes.

**Maintenance:** Re-snapshot after any infrastructure change (new package, signal-cli upgrade, etc.). Add reminder to DEV-PROTOCOL.md.

### Layer 4: Provision script (documentation as code)

Create `scripts/provision-instance.sh` that documents everything installed on the box. Not for automation — for reference when the AMI gets stale or we need to understand what's on the instance.

Contents:
- apt packages list
- Node.js version + install method
- Java version
- signal-cli version + install location
- systemd unit locations
- nginx config
- Cloudflare tunnel setup
- Tailscale setup
- Firewall/security group expectations

## Implementation Order

1. **Tailscale CI/CD** — Cursor executes. Needs Lee to create Tailscale OAuth client and add secrets to GitHub.
2. **Elastic IP** — Cursor executes via AWS CLI (may already be done from current troubleshooting session).
3. **AMI snapshot** — Cursor executes via AWS CLI after deploy confirmed.
4. **Provision script** — Cursor SSHes in, inventories what's installed, writes the script.

## Verification

- Push a trivial commit to main, confirm CI/CD deploys via Tailscale
- Confirm manual `./scripts/deploy.sh` works from Lee's Mac via Tailscale
- Stop/start instance, confirm Elastic IP persists and Tailscale reconnects
- Document AMI ID in this spec after creation
