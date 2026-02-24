# Iji deploy and CI/CD

Iji runs on EC2 and is deployed automatically on push to `main`. Local-only changes are broken changes — every code change must be committed and pushed.

## Server

- **Host:** ubuntu@3.149.229.204 (t3.small)
- **App dir:** /home/ubuntu/household-agent
- **Service:** iji.service (systemd), `ExecStart=/usr/bin/node src/index.js`
- **signal-cli:** /opt/signal-cli-0.13.24/bin/signal-cli (used by deploy workflow for notifications)
- **SSH key (local):** ~/.ssh/lees-alpha-trading.pem

Verify with: `./scripts/check-server.sh`

## GitHub repo and secret

1. Create a **private** repo on GitHub (e.g. `leedavis-irl/household-agent`).
2. Add the repo as `origin` and push (see “First-time repo setup” below).
3. **Add secret:** Settings → Secrets and variables → Actions → New repository secret:
   - **Name:** `EC2_SSH_KEY`
   - **Value:** Paste the **entire contents** of `~/.ssh/lees-alpha-trading.pem` (the private key so GitHub Actions can SSH to EC2).
4. After this, every push to `main` will trigger a deploy.

## What runs on push to main

1. **Rollback SHA** — Current HEAD on the server is recorded.
2. **Deploy** — Server runs: `git fetch origin main`, `git reset --hard origin/main`, `npm ci`, then stop iji, wait 15s (for systemd “deactivating”), start iji.
3. **Health check** — Up to 5 attempts to confirm `systemctl is-active iji.service` is `active`.
4. **On health failure** — Server is reset to the rollback SHA, `npm ci`, restart iji again.
5. **Notify** — A Signal message is sent to +13392360070 (via signal-cli on the server): “Iji deploy succeeded” or “Iji deploy FAILED…”.

The server must have a **git repo** at `/home/ubuntu/household-agent` (so the workflow can `git fetch`/`git reset`), `node`/`npm` installed, and signal-cli at `/opt/signal-cli-0.13.24/bin/signal-cli` (workflow uses this path for deploy notifications). The 15s sleep helps when the systemd unit gets stuck in “deactivating”. If the app dir was set up by copy instead of clone, run on the server once: `cd /home/ubuntu/household-agent && git init && git remote add origin https://github.com/leedavis-irl/household-agent.git && git fetch origin main && git branch -M main && git reset --hard origin/main` (then re-copy any local-only files like `.env`/config if needed).

## Manual scripts (fallbacks)

Run from repo root.

- **Deploy:** `./scripts/deploy.sh` (deploys current `origin/main`; server must already have the repo). Use `./scripts/deploy.sh --push` to push local main first, then deploy.
- **Rollback:** `./scripts/rollback.sh` (resets server to `HEAD~1`) or `./scripts/rollback.sh <commit-sha>`.

Override via env: `SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_DIR`.

Make scripts executable once: `chmod +x scripts/deploy.sh scripts/rollback.sh`

## First-time repo setup (do once)

From your local machine (source of truth at ~/Projects/Home/household-agent):

```bash
cd ~/Projects/Home/household-agent
git init
git add .
git commit -m "Initial commit: Iji household agent"
git branch -M main
git remote add origin https://github.com/leedavis-irl/household-agent.git   # or your repo URL
git push -u origin main
```

Then on the **server** (one-time), clone so the workflow can `git fetch`/`git reset`:

```bash
ssh -i ~/.ssh/lees-alpha-trading.pem ubuntu@3.149.229.204
# On server:
git clone https://github.com/leedavis-irl/household-agent.git /home/ubuntu/household-agent
cd /home/ubuntu/household-agent
npm ci
# Ensure config, .env, and data are in place (not in repo). Then:
sudo systemctl start iji
```

Use a deploy key or HTTPS with a token if the repo is private; the workflow uses the same clone for deploy.

## Rule

**Every code change gets committed and pushed to main. GitHub Actions handles the deploy. No exceptions.** Local-only changes are broken changes. This applies to Cursor (and any human) — after any code change to Iji, commit and push.
