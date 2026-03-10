# Secret Files on EC2

These files are gitignored and must be manually placed on the server. The deploy
pipeline checks for the required subset before deploying (see the "Preflight"
step in `.github/workflows/deploy.yml`).

Server path: `/home/ubuntu/household-agent/`

## Required files

### `.env`

Runtime environment variables. Without this the service won't start.

| Variable | Required | Source |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | Yes | [Anthropic Console](https://console.anthropic.com/) → API Keys |
| `HA_URL` | Yes | Home Assistant instance URL (Tailscale: `http://100.127.233.50:8123`) |
| `HA_TOKEN` | Yes | HA → Profile → Long-Lived Access Tokens |
| `SIGNAL_ACCOUNT` | Yes | The phone number registered with signal-cli on this server |
| `SIGNAL_ENABLED` | Yes | `true` in production |
| `SIGNAL_CLI_PATH` | Yes | `/opt/signal-cli-0.13.24/bin/signal-cli` on EC2 |
| `MONARCH_EMAIL` | No | Monarch Money login email |
| `MONARCH_PASSWORD` | No | Monarch Money password |
| `MONARCH_TOTP_SECRET` | No | Base32 TOTP secret for Monarch MFA |
| `TWILIO_ACCOUNT_SID` | No | Twilio console → Account SID |
| `TWILIO_AUTH_TOKEN` | No | Twilio console → Auth Token |
| `TWILIO_FROM_NUMBER` | No | Twilio purchased number (e.g. `+18005551234`) |

**How to update:** SSH in, edit the file, restart the service.

```bash
ssh ubuntu@34.208.73.189
cd /home/ubuntu/household-agent
nano .env
sudo systemctl restart iji.service
```

### `config/google-service-account.json`

Google Cloud service account key used for Calendar API (read via domain-wide
delegation). Required for all calendar tools.

**Source:** Google Cloud Console → IAM → Service Accounts → Keys → Create Key (JSON).

**How to update:**
1. Create a new key in the Cloud Console.
2. SCP the file to the server:
   ```bash
   scp google-service-account.json ubuntu@34.208.73.189:/home/ubuntu/household-agent/config/
   ```
3. Restart the service: `sudo systemctl restart iji.service`
4. Delete the old key in the Cloud Console.

### `config/google-oauth-credentials.json`

OAuth 2.0 client credentials for Gmail API (email tools).

**Source:** Google Cloud Console → APIs & Credentials → OAuth 2.0 Client IDs →
Download JSON.

**How to update:** Same SCP procedure as the service account. This file rarely
changes — it's the client ID/secret, not the tokens.

## Optional files

### `data/oauth-tokens.json`

Per-user OAuth refresh tokens for Gmail. Created automatically by
`scripts/gmail-auth.js` during onboarding. Currently only Lee has a token.

**How to create for a new user:** Run the Gmail auth script on a machine with a
browser, then SCP the updated tokens file to the server.

```bash
# On your local machine:
node scripts/gmail-auth.js <member_id>
# Follow the browser OAuth flow, then:
scp data/oauth-tokens.json ubuntu@34.208.73.189:/home/ubuntu/household-agent/data/
```

### `data/monarch-session.json`

Cached Monarch Money session. Created automatically on first successful login.
No manual action needed — the app regenerates it.

### `data/iji.db`

SQLite database. Created automatically on first startup. Migrations run inline.
Back up periodically:

```bash
ssh ubuntu@34.208.73.189
cp /home/ubuntu/household-agent/data/iji.db ~/backups/iji-$(date +%Y%m%d).db
```

## GitHub Secrets (CI/CD)

These are configured in the GitHub repo settings, not on the server filesystem:

| Secret | Purpose |
|--------|---------|
| `EC2_SSH_KEY` | SSH private key for `ubuntu@34.208.73.189` |

## Checklist for new EC2 instance

1. Clone the repo: `git clone <repo-url> /home/ubuntu/household-agent`
2. Copy `.env` from a secure source (1Password, previous instance backup).
3. Copy `config/google-service-account.json` from Cloud Console.
4. Copy `config/google-oauth-credentials.json` from Cloud Console.
5. Run `scripts/gmail-auth.js` for each user who needs email tools (or SCP existing `data/oauth-tokens.json`).
6. Run `npm ci`.
7. Enable and start the systemd service: `sudo systemctl enable iji.service && sudo systemctl start iji.service`
8. Verify: `curl http://127.0.0.1:3001/health`
